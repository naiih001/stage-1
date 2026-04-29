import { IsOptional, IsString, IsIn, IsInt, Min, Max, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class ProfileQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['male', 'female'])
  gender?: 'male' | 'female';

  @IsOptional()
  @IsString()
  @IsIn(['child', 'teenager', 'adult', 'senior'])
  age_group?: 'child' | 'teenager' | 'adult' | 'senior';

  @IsOptional()
  @IsString()
  country_id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  min_age?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  max_age?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  min_gender_probability?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  min_country_probability?: number;

  @IsOptional()
  @IsString()
  @IsIn(['age', 'created_at', 'gender_probability'])
  sort_by?: 'age' | 'created_at' | 'gender_probability' = 'created_at';

  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  @IsIn(['csv'])
  format?: string;
}

export class SearchQueryDto {
  @IsString()
  q: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}
