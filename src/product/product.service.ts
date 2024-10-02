import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createReadStream } from 'fs';
import * as csvParser from 'csv-parser';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProductDocument } from './schemas/product.schema';
import { VendorDocument } from './schemas/vendor.schema';
import { ManufacturerDocument } from './schemas/manufacturer.schema';
import { OpenAI } from 'openai';
import { nanoid } from 'nanoid';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ProductImportService {
  private readonly logger = new Logger(ProductImportService.name);
  private openai: OpenAI;
  private vendorCache = new Map<string, string>();
  private manufacturerCache = new Map<string, string>();

  constructor(
    @InjectModel('Product') private productModel: Model<ProductDocument>,
    @InjectModel('Vendor') private vendorModel: Model<VendorDocument>,
    @InjectModel('Manufacturer')
    private manufacturerModel: Model<ManufacturerDocument>,
    private configService: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  @Cron('0 0 * * *')
  async importProducts() {
    this.logger.log('Starting product import');

    const headers = [
      'SiteSource',
      'ItemID',
      'ManufacturerID',
      'ManufacturerCode',
      'ManufacturerName',
      'ProductID',
      'ProductName',
      'ProductDescription',
      'ManufacturerItemCode',
      'ItemDescription',
      'ImageFileName',
      'ItemImageURL',
      'NDCItemCode',
      'PKG',
      'UnitPrice',
      'QuantityOnHand',
      'PriceDescription',
      'Availability',
      'PrimaryCategoryID',
      'PrimaryCategoryName',
      'SecondaryCategoryID',
      'SecondaryCategoryName',
      'CategoryID',
      'CategoryName',
      'IsRX',
      'IsTBD',
    ];

    const chunkSize = 1000;
    let chunk: any[] = [];

    return new Promise((resolve, reject) => {
      const stream = createReadStream('./src/testingData/raw.txt')
        .pipe(
          csvParser({
            separator: '\t',
            headers: headers,
            skipLines: 1,
          }),
        )
        .on('data', async (row) => {
          chunk.push(row);

          if (chunk.length >= chunkSize) {
            stream.pause();

            try {
              await this.processChunk(chunk);
            } catch (error) {
              this.logger.error(`Error processing chunk: ${error.message}`);
            }

            chunk = [];
            stream.resume();
          }
        })
        .on('end', async () => {
          if (chunk.length > 0) {
            try {
              await this.processChunk(chunk);
            } catch (error) {
              this.logger.error(
                `Error processing final chunk: ${error.message}`,
              );
            }
          }
          this.logger.log('Product import completed');
          resolve(null);
        })
        .on('error', (error) => {
          this.logger.error(`Error reading CSV file: ${error.message}`);
          reject(error);
        });
    });
  }

  private async processChunk(chunk: any[]): Promise<void> {
    const groupedData = chunk.reduce((accumulator, currentItem) => {
      const productID = currentItem['ProductID'];
      const itemId = currentItem['ItemID'];

      if (!productID || !itemId) {
        this.logger.warn('Missing ProductID or ItemID in row, skipping.');
        return accumulator;
      }

      if (!accumulator[productID]) {
        accumulator[productID] = {
          row: currentItem,
          variants: [],
        };
      }

      const variant = this.constructVariant(currentItem);
      accumulator[productID].variants.push(variant);

      return accumulator;
    }, {});

    const productIDs = Object.keys(groupedData);

    const existingProducts = await this.productModel.find({
      productID: { $in: productIDs },
    });

    const existingProductsMap = new Map<string, any>();
    existingProducts.forEach((product) => {
      existingProductsMap.set(product.productID, product);
    });

    const bulkOps = [];

    for (const productID of productIDs) {
      const group = groupedData[productID];
      const row = group.row;
      const variants = group.variants;
      console.log("row['SiteSource']", row['SiteSource']);
      const vendorId = await this.checkVendor(row['SiteSource']);
      const manufacturerId = await this.ensureManufacturer(
        row['ManufacturerID'],
        row['ManufacturerName'],
      );

      let productDoc;
      if (existingProductsMap.has(productID)) {
        const existingProduct = existingProductsMap.get(productID);

        existingProduct.name = row['ProductName'];
        existingProduct.description = row['ProductDescription'] || '';
        existingProduct.vendorId = vendorId;
        existingProduct.manufacturerId = manufacturerId;
        existingProduct.availability = row['Availability'] || 'available';
        existingProduct.images = this.parseImages(row);

        // Merge variants
        const existingVariants = existingProduct.variants || [];
        const variantMap = new Map<string, any>();
        existingVariants.forEach((variant) => {
          variantMap.set(variant.sku, variant);
        });
        variants.forEach((variant) => {
          if (variantMap.has(variant.sku)) {
            const existingVariant = variantMap.get(variant.sku);
            if (this.isVariantUpdated(existingVariant, variant)) {
              variantMap.set(variant.sku, variant);
            }
          } else {
            variantMap.set(variant.sku, variant);
          }
        });

        existingProduct.variants = Array.from(variantMap.values());

        productDoc = existingProduct;
      } else {
        productDoc = {
          docId: nanoid(),
          productID: productID,
          name: row['ProductName'],
          description: row['ProductDescription'] || '',
          vendorId: vendorId,
          manufacturerId: manufacturerId,
          storefrontPriceVisibility: 'members-only',
          variants: variants,
          options: this.generateOptions(row),
          availability: row['Availability'] || 'available',
          isFragile: false,
          published: 'published',
          isTaxable: true,
          images: this.parseImages(row),
          categoryId: 'U8YOybu1vbgQdbhSkrpmAYIV',
          dataPublic: {},
          immutable: false,
          deploymentId: 'd8039',
          docType: 'item',
          namespace: 'items',
          companyId: '2yTnVUyG6H9yRX3K1qIFIiRz',
          status: 'active',
          info: {
            transactionId: nanoid(),
            skipEvent: false,
            userRequestId: nanoid(),
          },
        };

        if (!productDoc.description || productDoc.description.trim() === '') {
          const enhancedDescription = await this.enhanceDescription(
            productDoc.name,
            productDoc.description,
          );
          productDoc.description = enhancedDescription;
        }
      }

      if (!productDoc.docId) {
        this.logger.error(`Product with ProductID ${productID} has null docId`);
        productDoc.docId = nanoid();
      }

      const updateDoc: any = {
        $set: {
          productID: productDoc.productID,
          name: productDoc.name,
          description: productDoc.description,
          vendorId: productDoc.vendorId,
          manufacturerId: productDoc.manufacturerId,
          storefrontPriceVisibility: productDoc.storefrontPriceVisibility,
          variants: productDoc.variants,
          options: productDoc.options,
          availability: productDoc.availability,
          isFragile: productDoc.isFragile,
          published: productDoc.published,
          isTaxable: productDoc.isTaxable,
          images: productDoc.images,
          categoryId: productDoc.categoryId,
          dataPublic: productDoc.dataPublic,
          immutable: productDoc.immutable,
          deploymentId: productDoc.deploymentId,
          docType: productDoc.docType,
          namespace: productDoc.namespace,
          companyId: productDoc.companyId,
          status: productDoc.status,
          info: productDoc.info,
        },
      };

      if (!existingProductsMap.has(productID)) {
        updateDoc.$setOnInsert = {
          docId: productDoc.docId || nanoid(),
        };
      }

      bulkOps.push({
        updateOne: {
          filter: { productID: productID },
          update: updateDoc,
          upsert: true,
        },
      });
    }

    if (bulkOps.length > 0) {
      try {
        await this.productModel.bulkWrite(bulkOps);
      } catch (error) {
        this.logger.error('Error on bulk insertion', error);
        throw error;
      }
    }
  }
  private async checkVendor(siteSource: string): Promise<string> {
    let vendor = await this.vendorModel.findOne({ name: siteSource }).exec();

    if (!vendor) {
      vendor = new this.vendorModel({
        vendorId: nanoid(),
        siteSource,
        name: siteSource,
      });

      await vendor.save();
    }

    return vendor.vendorId;
  }

  private async ensureManufacturer(
    manufacturerId: string,
    manufacturerName: string,
  ): Promise<string> {
    let manufacturer = await this.manufacturerModel
      .findOne({ manufacturerId })
      .exec();

    if (!manufacturer) {
      manufacturer = new this.manufacturerModel({
        manufacturerId,
        name: manufacturerName,
      });

      await manufacturer.save();
    }

    return manufacturer.manufacturerId;
  }

  private constructVariant(row: any) {
    const variantId = nanoid();
    const isAvailable = this.parseBoolean(row['QuantityOnHand']);
    const price = this.parseNumber(row['UnitPrice']);
    const description = row['ItemDescription'];
    const packaging = row['PKG'];
    const manufacturerItemCode = row['ManufacturerItemCode'];
    const manufacturerItemId = row['ItemID'];
    const sku = `${manufacturerItemId}${manufacturerItemCode}${packaging}`;
    const optionName = `${packaging}, ${description}`;

    return {
      id: variantId,
      available: isAvailable,
      attributes: {
        packaging: packaging,
        description: description,
      },
      cost: price,
      currency: 'EUR',
      description: description,
      manufacturerItemCode: manufacturerItemCode,
      manufacturerItemId: manufacturerItemId,
      packaging: packaging,
      price: price,
      optionName: optionName,
      optionsPath: nanoid(),
      optionItemsPath: nanoid(),
      sku: sku,
      active: true,
      images: this.parseImages(row),
      itemCode: row['NDCItemCode'],
    };
  }

  private isVariantUpdated(existingVariant: any, updatedVariant: any): boolean {
    const priceChanged = existingVariant.price !== updatedVariant.price;
    const availabilityChanged =
      existingVariant.available !== updatedVariant.available;
    const descriptionChanged =
      existingVariant.description !== updatedVariant.description;

    return priceChanged || availabilityChanged || descriptionChanged;
  }

  private generateOptions(row: any) {
    return [
      {
        id: nanoid(),
        name: 'packaging',
        dataField: null,
        values: [
          {
            id: nanoid(),
            name: row['PKG'],
            value: row['PKG'],
          },
        ],
      },
      {
        id: nanoid(),
        name: 'description',
        dataField: null,
        values: [
          {
            id: nanoid(),
            name: row['ItemDescription'],
            value: row['ItemDescription'],
          },
        ],
      },
    ];
  }

  private parseImages(row: any) {
    return [
      {
        fileName: row['ImageFileName'] || '',
        cdnLink: row['ItemImageURL'] || null,
        i: 0,
        alt: row['ItemDescription'] || null,
      },
    ];
  }

  private parseNumber(value: string): number {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }

  private parseBoolean(value: string): boolean {
    const parsed = parseInt(value, 10);
    return !isNaN(parsed) && parsed > 0;
  }

  private async enhanceDescription(
    name: string,
    description: string,
    // category: string,
  ): Promise<string> {
    //     const prompt = `
    // You are an expert in medical sales. Your specialty is medical consumables used by hospitals on a daily basis. Your task is to enhance the description of a product based on the information provided.

    // Product name: ${name}
    // Product description: ${description}
    // Category: ${category}

    // New Description:
    // `;

    try {
      // const response = await this.openai.createCompletion({
      //   model: 'gpt-3.5-turbo',
      //   prompt: prompt,
      //   max_tokens: 150,
      //   n: 1,
      //   stop: null,
      //   temperature: 0.7,
      // });
      // return response.data.choices[0].text.trim();
      return description;
    } catch (error) {
      this.logger.error(`Error enhancing description: ${error.message}`);
      return description;
    }
  }
}
