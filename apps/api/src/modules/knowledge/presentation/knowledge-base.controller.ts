import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  CreateKnowledgeBaseSchema,
  CreateTextDocumentSchema,
  CreateUrlDocumentSchema,
  PreviewChunksSchema,
  RetrieveTestSchema,
  UpdateKnowledgeBaseSchema,
  UpdateTextDocumentSchema,
  UploadDocumentSchema,
} from '@botme/shared';
import { Roles } from '../../../core/decorators/roles.decorator';
import { CurrentUser } from '../../../core/decorators/current-user.decorator';
import type { AuthenticatedRequest } from '../../../core/decorators/current-user.decorator';
import { KnowledgeBaseService } from '../application/knowledge-base.service';

@Controller('knowledge-bases')
export class KnowledgeBaseController {
  constructor(private readonly knowledge: KnowledgeBaseService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.knowledge.list(user.workspaceId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedRequest['user'], @Param('id') id: string) {
    return this.knowledge.get(user.workspaceId, id);
  }

  @Post()
  @Roles('MEMBER')
  create(@CurrentUser() user: AuthenticatedRequest['user'], @Body() body: unknown) {
    return this.knowledge.create(user.workspaceId, CreateKnowledgeBaseSchema.parse(body));
  }

  @Patch(':id')
  @Roles('MEMBER')
  update(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.knowledge.update(user.workspaceId, id, UpdateKnowledgeBaseSchema.parse(body));
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@CurrentUser() user: AuthenticatedRequest['user'], @Param('id') id: string) {
    return this.knowledge.deleteKnowledgeBase(user.workspaceId, id);
  }

  @Get(':id/documents')
  listDocuments(@CurrentUser() user: AuthenticatedRequest['user'], @Param('id') id: string) {
    return this.knowledge.listDocuments(user.workspaceId, id);
  }

  @Get(':id/documents/:docId')
  getDocument(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Param('docId') docId: string,
  ) {
    return this.knowledge.getDocument(user.workspaceId, id, docId);
  }

  @Post(':id/documents/upload-url')
  @Roles('MEMBER')
  uploadUrl(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.knowledge.createUploadUrl(user.workspaceId, id, UploadDocumentSchema.parse(body));
  }

  @Post(':id/documents/upload')
  @Roles('MEMBER')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  uploadFile(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string; size: number },
    @Body() body: Record<string, string>,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Файл не передан');
    }
    const meta = UploadDocumentSchema.parse({
      filename: body.filename ?? file.originalname,
      mimeType: body.mimeType,
      sizeBytes: Number(body.sizeBytes ?? file.size),
      fileHash: body.fileHash,
    });
    return this.knowledge.uploadFile(user.workspaceId, id, meta, file.buffer);
  }

  @Get(':id/ingestion-status')
  ingestionStatus(@CurrentUser() user: AuthenticatedRequest['user'], @Param('id') id: string) {
    return this.knowledge.getIngestionStatus(user.workspaceId, id);
  }

  @Get(':id/diagnostics')
  @Roles('MEMBER')
  diagnostics(@CurrentUser() user: AuthenticatedRequest['user'], @Param('id') id: string) {
    return this.knowledge.getDiagnostics(user.workspaceId, id);
  }

  @Post(':id/heal')
  @Roles('ADMIN')
  heal(@CurrentUser() user: AuthenticatedRequest['user'], @Param('id') id: string) {
    return this.knowledge.healKnowledgeBase(user.workspaceId, id);
  }

  @Post(':id/documents/text')
  @Roles('MEMBER')
  createText(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.knowledge.createTextDocument(
      user.workspaceId,
      id,
      CreateTextDocumentSchema.parse(body),
    );
  }

  @Patch(':id/documents/:docId/text')
  @Roles('MEMBER')
  updateText(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Body() body: unknown,
  ) {
    return this.knowledge.updateTextDocument(
      user.workspaceId,
      id,
      docId,
      UpdateTextDocumentSchema.parse(body),
    );
  }

  @Post(':id/documents/:docId/rollback-upload')
  @Roles('MEMBER')
  rollbackUpload(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Param('docId') docId: string,
  ) {
    return this.knowledge.rollbackFailedUpload(user.workspaceId, id, docId).then(() => ({ ok: true }));
  }

  @Post(':id/documents/text/preview-chunks')
  @Roles('MEMBER')
  previewChunks(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = PreviewChunksSchema.parse(body);
    return this.knowledge.previewTextChunks(
      user.workspaceId,
      id,
      parsed.content,
      parsed.mimeType,
    );
  }

  @Post(':id/documents/url')
  @Roles('MEMBER')
  createUrl(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.knowledge.createUrlDocument(
      user.workspaceId,
      id,
      CreateUrlDocumentSchema.parse(body),
    );
  }

  @Post(':id/documents/:docId/confirm')
  @Roles('MEMBER')
  confirm(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Param('docId') docId: string,
  ) {
    return this.knowledge.confirmUpload(user.workspaceId, id, docId);
  }

  @Post(':id/documents/:docId/retry')
  @Roles('MEMBER')
  retry(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Param('docId') docId: string,
  ) {
    return this.knowledge.retryDocument(user.workspaceId, id, docId);
  }

  @Get(':id/documents/:docId/chunks')
  listChunks(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ) {
    return this.knowledge.listChunks(
      user.workspaceId,
      id,
      docId,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
      search,
    );
  }

  @Post(':id/retrieve-test')
  @Roles('MEMBER')
  retrieveTest(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.knowledge.runRetrievalTest(user.workspaceId, id, RetrieveTestSchema.parse(body));
  }

  @Delete(':id/documents/:docId')
  @Roles('MEMBER')
  removeDoc(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Param('docId') docId: string,
  ) {
    return this.knowledge.deleteDocument(user.workspaceId, id, docId);
  }
}
