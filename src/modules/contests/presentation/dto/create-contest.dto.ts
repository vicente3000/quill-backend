import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Max,
  MaxLength,
  registerDecorator,
  ValidationArguments,
} from 'class-validator';
import {
  CONTEST_ACCOUNT_TYPES,
  CONTEST_MODES,
} from '../../domain/entities/contest.entity';
import type {
  ContestAccountType,
  ContestMode,
} from '../../domain/entities/contest.entity';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

function IsAfterProperty(property: string) {
  return (target: object, propertyName: string) => {
    registerDecorator({
      name: 'isAfterProperty',
      target: target.constructor,
      propertyName,
      constraints: [property],
      options: { message: `${propertyName} must be after ${property}` },
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const [relatedProperty] = args.constraints as [string];
          const related = (args.object as Record<string, unknown>)[
            relatedProperty
          ];
          if (typeof value !== 'string' || typeof related !== 'string') {
            return false;
          }

          return Date.parse(value) > Date.parse(related);
        },
      },
    });
  };
}

export class CreateContestDto {
  @Transform(trim)
  @IsString()
  @Length(3, 80)
  name!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsISO8601({ strict: true, strictSeparator: true })
  startDate!: string;

  @IsISO8601({ strict: true, strictSeparator: true })
  @IsAfterProperty('startDate')
  endDate!: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsPositive()
  @Max(1_000_000_000)
  initialBalance!: number;

  @IsIn(CONTEST_MODES)
  mode!: ContestMode;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(CONTEST_ACCOUNT_TYPES, { each: true })
  allowedAccountTypes!: ContestAccountType[];
}
