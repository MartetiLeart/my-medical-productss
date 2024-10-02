import { Module } from '@nestjs/common';
import { ProductController } from './product.controller';
import { ProductImportService } from './product.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductSchema } from './schemas/product.schema';
import { VendorSchema } from './schemas/vendor.schema';
import { ManufacturerSchema } from './schemas/manufacturer.schema';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Product', schema: ProductSchema },
      { name: 'Vendor', schema: VendorSchema },
      { name: 'Manufacturer', schema: ManufacturerSchema },
    ]),
  ],
  controllers: [ProductController],
  providers: [ProductImportService, ConfigService],
})
export class ProductsModule {}
