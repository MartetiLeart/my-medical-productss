import { Controller, Get } from '@nestjs/common';
import { ProductImportService } from './product.service';

@Controller('product')
export class ProductController {
  constructor(private readonly productImportService: ProductImportService) {}

  @Get('start')
  async startImport() {
    await this.productImportService.importProducts();
    return { message: 'Product import started' };
  }
}
