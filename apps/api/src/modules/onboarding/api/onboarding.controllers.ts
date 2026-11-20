import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  type BankAccountInput,
  BankAccountInputSchema,
  type CreateUpload,
  CreateUploadSchema,
  type MenuImport,
  type MenuImportResult,
  MenuImportSchema,
  type MenuPhotos,
  MenuPhotosSchema,
  type Quiz,
  type QuizResult,
  type QuizSubmission,
  QuizSubmissionSchema,
  type RiderApplication,
  type RiderGuarantor,
  RiderGuarantorSchema,
  type RiderIdentity,
  RiderIdentitySchema,
  type RiderPersonalDetails,
  RiderPersonalDetailsSchema,
  type RiderVehicle,
  RiderVehicleSchema,
  type StepView,
  StepViewSchema,
  type TestOrderChecklist,
  TestOrderChecklistSchema,
  type UploadTicket,
  type VendorApplication,
  type VendorBusinessDetails,
  VendorBusinessDetailsSchema,
  type VendorDocuments,
  VendorDocumentsSchema,
  type VendorLocation,
  VendorLocationSchema,
} from '@delyva/contracts';
import type { Request, Response } from 'express';
import { type AuthPrincipal, AuthGuard, Principal } from '../../../shared/auth/auth.guard.js';
import { AppError } from '../../../shared/errors/app-error.js';
import { Idempotent } from '../../../shared/idempotency/idempotency.interceptor.js';
import { LocalDiskStorage } from '../../../shared/storage/local-disk.storage.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../../../shared/storage/storage.js';
import { ZodBodyPipe } from '../../../shared/validation/zod-body.pipe.js';
import { menuCsvTemplate } from '../domain/menu-csv.js';
import { RiderOnboarding } from '../application/rider-onboarding.js';
import { UploadService } from '../application/uploads.js';
import { VendorOnboarding } from '../application/vendor-onboarding.js';

/** Rider application (any signed-in user may apply; the rider role is granted on approval). */
@Controller('v1/rider-applications/me')
@UseGuards(AuthGuard)
export class RiderApplicationsController {
  /** @param rider use cases */
  constructor(private readonly rider: RiderOnboarding) {}

  /** GET /v1/rider-applications/me */
  @Get()
  get(@Principal() p: AuthPrincipal): Promise<RiderApplication> {
    return this.rider.get(p.userId);
  }

  /** POST …/step-views */
  @Post('step-views')
  @HttpCode(204)
  async view(
    @Principal() p: AuthPrincipal,
    @Body(new ZodBodyPipe(StepViewSchema)) b: StepView,
  ): Promise<void> {
    await this.rider.recordView(p.userId, b.step);
  }

  /** PUT …/personal-details */
  @Put('personal-details')
  personal(
    @Principal() p: AuthPrincipal,
    @Body(new ZodBodyPipe(RiderPersonalDetailsSchema)) b: RiderPersonalDetails,
  ): Promise<RiderApplication> {
    return this.rider.savePersonalDetails(p.userId, b);
  }

  /** PUT …/identity */
  @Put('identity')
  identity(
    @Principal() p: AuthPrincipal,
    @Body(new ZodBodyPipe(RiderIdentitySchema)) b: RiderIdentity,
  ): Promise<RiderApplication> {
    return this.rider.saveIdentity(p.userId, b);
  }

  /** PUT …/vehicle */
  @Put('vehicle')
  vehicle(
    @Principal() p: AuthPrincipal,
    @Body(new ZodBodyPipe(RiderVehicleSchema)) b: RiderVehicle,
  ): Promise<RiderApplication> {
    return this.rider.saveVehicle(p.userId, b);
  }

  /** PUT …/guarantor */
  @Put('guarantor')
  guarantor(
    @Principal() p: AuthPrincipal,
    @Body(new ZodBodyPipe(RiderGuarantorSchema)) b: RiderGuarantor,
  ): Promise<RiderApplication> {
    return this.rider.saveGuarantor(p.userId, b);
  }

  /** PUT …/bank-account */
  @Put('bank-account')
  bank(
    @Principal() p: AuthPrincipal,
    @Body(new ZodBodyPipe(BankAccountInputSchema)) b: BankAccountInput,
  ): Promise<RiderApplication> {
    return this.rider.saveBankAccount(p.userId, b);
  }

  /** GET …/quiz */
  @Get('quiz')
  quiz(): Quiz {
    return this.rider.quiz();
  }

  /** POST …/quiz */
  @Post('quiz')
  @HttpCode(200)
  @Idempotent()
  submitQuiz(
    @Principal() p: AuthPrincipal,
    @Body(new ZodBodyPipe(QuizSubmissionSchema)) b: QuizSubmission,
  ): Promise<QuizResult> {
    return this.rider.submitQuiz(p.userId, b);
  }

  /** POST …/submit */
  @Post('submit')
  @HttpCode(200)
  @Idempotent()
  submit(@Principal() p: AuthPrincipal): Promise<RiderApplication> {
    return this.rider.submit(p.userId);
  }
}

/** Vendor application (creates the catalog vendor in draft, owned by the caller). */
@Controller('v1/vendor-applications')
export class VendorApplicationsController {
  /** @param vendor use cases */
  constructor(private readonly vendor: VendorOnboarding) {}

  /** GET /v1/vendor-applications/menu-template (public CSV template) */
  @Get('menu-template')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="delyva-menu-template.csv"')
  template(): string {
    return menuCsvTemplate();
  }

  /** GET /v1/vendor-applications/me */
  @Get('me')
  @UseGuards(AuthGuard)
  get(@Principal() p: AuthPrincipal): Promise<VendorApplication> {
    return this.vendor.get(p.userId);
  }

  /** POST …/me/step-views */
  @Post('me/step-views')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  async view(
    @Principal() p: AuthPrincipal,
    @Body(new ZodBodyPipe(StepViewSchema)) b: StepView,
  ): Promise<void> {
    await this.vendor.recordView(p.userId, b.step);
  }

  /** PUT …/me/business-details */
  @Put('me/business-details')
  @UseGuards(AuthGuard)
  business(
    @Principal() p: AuthPrincipal,
    @Body(new ZodBodyPipe(VendorBusinessDetailsSchema)) b: VendorBusinessDetails,
  ): Promise<VendorApplication> {
    return this.vendor.saveBusinessDetails(p.userId, b);
  }

  /** PUT …/me/documents */
  @Put('me/documents')
  @UseGuards(AuthGuard)
  documents(
    @Principal() p: AuthPrincipal,
    @Body(new ZodBodyPipe(VendorDocumentsSchema)) b: VendorDocuments,
  ): Promise<VendorApplication> {
    return this.vendor.saveDocuments(p.userId, b);
  }

  /** PUT …/me/location */
  @Put('me/location')
  @UseGuards(AuthGuard)
  location(
    @Principal() p: AuthPrincipal,
    @Body(new ZodBodyPipe(VendorLocationSchema)) b: VendorLocation,
  ): Promise<VendorApplication> {
    return this.vendor.saveLocation(p.userId, b);
  }

  /** POST …/me/menu-import */
  @Post('me/menu-import')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  @Idempotent()
  importMenu(
    @Principal() p: AuthPrincipal,
    @Body(new ZodBodyPipe(MenuImportSchema)) b: MenuImport,
  ): Promise<MenuImportResult> {
    return this.vendor.importMenu(p.userId, b.csvUploadId);
  }

  /** PUT …/me/menu-photos */
  @Put('me/menu-photos')
  @UseGuards(AuthGuard)
  photos(
    @Principal() p: AuthPrincipal,
    @Body(new ZodBodyPipe(MenuPhotosSchema)) b: MenuPhotos,
  ): Promise<VendorApplication> {
    return this.vendor.saveMenuPhotos(p.userId, b);
  }

  /** PUT …/me/bank-account */
  @Put('me/bank-account')
  @UseGuards(AuthGuard)
  bank(
    @Principal() p: AuthPrincipal,
    @Body(new ZodBodyPipe(BankAccountInputSchema)) b: BankAccountInput,
  ): Promise<VendorApplication> {
    return this.vendor.saveBankAccount(p.userId, b);
  }

  /** PUT …/me/test-order */
  @Put('me/test-order')
  @UseGuards(AuthGuard)
  testOrder(
    @Principal() p: AuthPrincipal,
    @Body(new ZodBodyPipe(TestOrderChecklistSchema)) b: TestOrderChecklist,
  ): Promise<VendorApplication> {
    return this.vendor.saveTestOrder(p.userId, b);
  }

  /** POST …/me/submit */
  @Post('me/submit')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  @Idempotent()
  submit(@Principal() p: AuthPrincipal): Promise<VendorApplication> {
    return this.vendor.submit(p.userId);
  }
}

async function readBody(req: Request, max: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > max) throw new AppError('upload_rejected', 'File is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const q = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Upload tickets, plus the signed dev-only content endpoint of the local-disk adapter. */
@Controller('v1/uploads')
export class UploadsController {
  /** @param uploads service @param storage configured storage */
  constructor(
    private readonly uploads: UploadService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /** POST /v1/uploads */
  @Post()
  @UseGuards(AuthGuard)
  @Idempotent()
  create(
    @Principal() p: AuthPrincipal,
    @Body(new ZodBodyPipe(CreateUploadSchema)) b: CreateUpload,
  ): Promise<UploadTicket> {
    return this.uploads.create(p.userId, b);
  }

  private local(): LocalDiskStorage {
    if (!(this.storage instanceof LocalDiskStorage)) throw new AppError('not_found', 'Not found.');
    return this.storage;
  }

  /** PUT /v1/uploads/content?key&exp&ct&sig (local adapter only; signature is the auth) */
  @Put('content')
  @HttpCode(204)
  async put(@Query() query: Record<string, unknown>, @Req() req: Request): Promise<void> {
    const storage = this.local();
    const params = { key: q(query.key), exp: q(query.exp), ct: q(query.ct), sig: q(query.sig) };
    if (!storage.verify('PUT', params))
      throw new AppError('forbidden', 'The upload URL is invalid or expired.');
    const upload = await this.uploads.byKey(params.key);
    if (!upload) throw new AppError('not_found', 'Upload not found.');
    const body = await readBody(req, upload.maxSizeBytes);
    this.uploads.assertBytesAcceptable(
      upload,
      (req.header('content-type') ?? '').split(';')[0] ?? '',
      body,
    );
    await storage.write(params.key, body, upload.contentType);
  }

  /** GET /v1/uploads/content?key&exp&ct&sig (local adapter only) */
  @Get('content')
  async get(@Query() query: Record<string, unknown>, @Res() res: Response): Promise<void> {
    const storage = this.local();
    const params = { key: q(query.key), exp: q(query.exp), ct: q(query.ct), sig: q(query.sig) };
    if (!storage.verify('GET', params))
      throw new AppError('forbidden', 'The download URL is invalid or expired.');
    const meta = await storage.stat(params.key);
    if (!meta) throw new AppError('not_found', 'Not found.');
    res.setHeader('content-type', meta.contentType ?? 'application/octet-stream');
    res.setHeader('cache-control', 'private, no-store');
    res.send(await storage.read(params.key, meta.sizeBytes));
  }
}
