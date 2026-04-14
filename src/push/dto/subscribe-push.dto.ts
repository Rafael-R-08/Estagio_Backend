import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsObject,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class PushKeysDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  p256dh!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  auth!: string;
}

export class SubscribePushDto {
  @ApiProperty({ description: 'Push subscription endpoint' })
  @IsUrl()
  endpoint!: string;

  @ApiProperty({ type: PushKeysDto })
  @IsObject()
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}
