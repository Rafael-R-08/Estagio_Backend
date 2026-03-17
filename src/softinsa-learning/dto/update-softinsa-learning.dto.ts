import { PartialType } from '@nestjs/swagger';
import { CreateSoftinsaLearningDto } from './create-softinsa-learning.dto';

export class UpdateSoftinsaLearningDto extends PartialType(CreateSoftinsaLearningDto) {}
