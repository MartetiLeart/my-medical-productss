import { Schema, Document } from 'mongoose';

export interface VendorDocument extends Document {
  vendorId: string;
  name: string;
}

export const VendorSchema = new Schema<VendorDocument>({
  vendorId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
});
