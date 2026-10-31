// src/requests/requests.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { randomBytes } from 'node:crypto';
import { extname, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

import { RequestsService } from './requests.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateRequestDto } from './dto/update-request.dto';
import { ReplyRequestDto } from './dto/reply-request.dto';
import { ListRequestsQueryDto } from './dto/list-requests-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

// ── same MIME/EXT policy as UploadsController ───────────────
const ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'application/octet-stream', // Flutter default
];
const ALLOWED_EXT = [
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif',
];
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 5;

@UseGuards(JwtAuthGuard)
@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  // ── CREATE — multipart OR JSON; files OPTIONAL (0–5) ──
  @Post()
  @UseInterceptors(
    FilesInterceptor('images', MAX_FILES, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_BYTES },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname || '').toLowerCase();
        const mimeOk = ALLOWED_MIME.includes(file.mimetype);
        const extOk  = ALLOWED_EXT.includes(ext);
        if (!mimeOk && !extOk) {
          return cb(
            new BadRequestException(
              `Unsupported file: mime="${file.mimetype}", ext="${ext || 'none'}"`,
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async create(
    @CurrentUser() u,
    @Body() dto: CreateRequestDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    // Persist each uploaded file exactly like UploadsController does
    // → same folder, same naming, same URL format as /upload endpoint.
    const dir = join(process.cwd(), 'uploads');
    await mkdir(dir, { recursive: true });

    const urls: string[] = [];
    for (const file of files ?? []) {
      let ext = extname(file.originalname || '').toLowerCase();
      if (!ext || !ALLOWED_EXT.includes(ext)) {
        if (file.mimetype === 'image/png')       ext = '.png';
        else if (file.mimetype === 'image/webp') ext = '.webp';
        else if (file.mimetype === 'image/gif')  ext = '.gif';
        else if (file.mimetype === 'image/heic') ext = '.heic';
        else                                     ext = '.jpg';
      }
      const filename = `${randomBytes(16).toString('hex')}${ext}`;
      await writeFile(join(dir, filename), file.buffer);
      urls.push(`/uploads/${filename}`);
    }

    return this.requests.create(u.id, dto, urls);
  }

  // ── LIST ──
  @Get()
  list(@CurrentUser() u, @Query() q: ListRequestsQueryDto) {
    return this.requests.list(u.id, q);
  }

  // ── DETAIL ──
  @Get(':id')
  detail(@CurrentUser() u, @Param('id') id: string) {
    return this.requests.getDetail(id, u.id);
  }

  // ── UPDATE ──
  @Patch(':id')
  update(
    @CurrentUser() u,
    @Param('id') id: string,
    @Body() dto: UpdateRequestDto,
  ) {
    return this.requests.update(u.id, id, dto);
  }

  // ── CANCEL ──
  @Delete(':id')
  cancel(@CurrentUser() u, @Param('id') id: string) {
    return this.requests.cancel(u.id, id);
  }

  // ── REPLIES ──
  @Post(':id/replies')
  reply(
    @CurrentUser() u,
    @Param('id') id: string,
    @Body() dto: ReplyRequestDto,
  ) {
    return this.requests.reply(u.id, id, dto);
  }

  @Post(':id/replies/:replyId/accept')
  accept(
    @CurrentUser() u,
    @Param('id') id: string,
    @Param('replyId') replyId: string,
  ) {
    return this.requests.acceptReply(u.id, id, replyId);
  }

  @Delete(':id/replies/:replyId')
  withdraw(
    @CurrentUser() u,
    @Param('id') id: string,
    @Param('replyId') replyId: string,
  ) {
    return this.requests.withdrawReply(u.id, id, replyId);
  }
}