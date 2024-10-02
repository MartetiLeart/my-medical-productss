import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ManufacturerDocument = Manufacturer & Document;

@Schema()
export class Manufacturer {
  @Prop()
  manufacturerId: string;

  @Prop()
  name: string;

  @Prop()
  email?: string;

  @Prop()
  phone?: string;

  @Prop()
  address?: string;
}

export const ManufacturerSchema = SchemaFactory.createForClass(Manufacturer);
