import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GithubCliLoginDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  code_verifier: string;

  @IsString()
  @IsOptional()
  redirect_uri?: string;
}
