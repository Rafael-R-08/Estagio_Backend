import { ApiProperty } from '@nestjs/swagger';

export class ScrapedData {
  @ApiProperty()
  id: string;

  @ApiProperty()
  url: string;

  @ApiProperty()
  data: any;

  @ApiProperty()
  scrapedAt: Date;

  @ApiProperty({ required: false })
  error?: string;
}
