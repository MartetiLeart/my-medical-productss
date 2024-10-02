import { Schema, Document } from 'mongoose';

interface Image {
  fileName: string;
  cdnLink: string;
  alt: string | null;
}

interface Attributes {
  packaging: string;
  description: string;
}

export interface Variant {
  id: string;
  available: boolean;
  attributes: Attributes;
  cost: number;
  currency: string;
  description: string;
  manufacturerItemCode: string;
  packaging: string;
  price: number;
  optionName: string;
  optionsPath: string;
  optionItemsPath: string;
  sku: string;
  active: boolean;
  images: Image[];
  itemCode: string;
}

export interface OptionValue {
  id: string;
  name: string;
  value: string;
}

export interface Option {
  id: string;
  name: string;
  values: OptionValue[];
}

export interface ProductDocument extends Document {
  productID: string;
  docId: string;
  name: string;
  type: string;
  shortDescription: string;
  description: string;
  vendorId: string;
  manufacturerId: string;
  storefrontPriceVisibility: string;
  variants: Variant[];
  options: Option[];
  availability: string;
  isFragile: boolean;
  published: string;
  isTaxable: boolean;
  images: Image[];
  categoryId: string;
  isDeleted: boolean;
  dataPublic: Record<string, any>;
  immutable: boolean;
  deploymentId: string;
  docType: string;
  namespace: string;
  companyId: string;
  status: string;
  info: {
    createdBy: string;
    createdAt: string;
    updatedBy: string;
    updatedAt: string;
    deletedBy: string | null;
    deletedAt: string | null;
    dataSource: string;
    companyStatus: string;
    transactionId: string;
    skipEvent: boolean;
    userRequestId: string;
  };
}

export const ProductSchema = new Schema<ProductDocument>({
  productID: { type: String, required: true, unique: true },
  docId: { type: String, unique: true },
  name: { type: String, required: true },
  type: { type: String },
  shortDescription: { type: String, default: '' },
  description: { type: String, default: '' },
  vendorId: { type: String, required: true },
  manufacturerId: { type: String, required: true },
  storefrontPriceVisibility: { type: String, default: 'members-only' },
  variants: [
    {
      id: { type: String, required: true },
      available: { type: Boolean, default: true },
      attributes: {
        packaging: { type: String, default: '' },
        description: { type: String, default: '' },
      },
      cost: { type: Number, default: 0 },
      currency: { type: String, default: 'USD' },
      description: { type: String, default: '' },
      manufacturerItemCode: { type: String, default: '' },
      packaging: { type: String, default: '' },
      price: { type: Number, default: 0 },
      optionName: { type: String, default: '' },
      optionsPath: { type: String, default: '' },
      optionItemsPath: { type: String, default: '' },
      sku: { type: String, default: '' },
      active: { type: Boolean, default: true },
      images: [
        {
          fileName: { type: String, default: '' },
          cdnLink: { type: String, default: '' },
          alt: { type: String, default: null },
        },
      ],
      itemCode: { type: String, default: '' },
    },
  ],
  options: [
    {
      id: { type: String, required: true },
      name: { type: String, required: true },
      values: [
        {
          id: { type: String, required: true },
          name: { type: String, required: true },
          value: { type: String, required: true },
        },
      ],
    },
  ],
  availability: { type: String, default: 'available' },
  images: [
    {
      fileName: { type: String, default: '' },
      cdnLink: { type: String, default: '' },
      alt: { type: String, default: null },
    },
  ],
  isDeleted: { type: Boolean, default: false },
  status: { type: String, default: 'active' },
});
