import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Response } from 'express';
import { WidgetAdminRepository } from '../infrastructure/widget-admin.repository';
import { OperatorRuntimeTokenService } from './operator-runtime-token.service';

@Injectable()
export class OperatorSelfHostPackService {
  constructor(
    private readonly widgets: WidgetAdminRepository,
    private readonly tokens: OperatorRuntimeTokenService,
    private readonly config: ConfigService,
  ) {}

  async streamZip(
    workspaceId: string,
    widgetId: string,
    userId: string,
    res: Response,
  ): Promise<void> {
    const row = await this.widgets.findById(workspaceId, widgetId);
    if (!row) throw new NotFoundException('Виджет не найден');

    const domains = row.domains.map((d) => d.domain);
    const { plainToken } = await this.tokens.ensureDefaultToken(workspaceId, widgetId, userId, domains);

    const embedOrigin = this.config.get<string>('WEB_URL', 'https://agent.neeklo.ru').replace(/\/$/, '');
    const wsOrigin = embedOrigin.replace(/^http/, 'ws');
    const turnHost = this.config.get<string>('TURN_HOST', 'turn.neeklo.ru');
    const packRoot = join(process.cwd(), 'operator-runtime');
    const tmpDir = join(tmpdir(), `botme-operator-${widgetId}-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    try {
      this.copyDir(packRoot, tmpDir);
      writeFileSync(
        join(tmpDir, '.env'),
        [
          `BOTME_API_URL=${embedOrigin}/api`,
          `BOTME_WS_URL=${wsOrigin}/socket.io`,
          `BOTME_OPERATOR_TOKEN=${plainToken}`,
          `BOTME_WORKSPACE_ID=${workspaceId}`,
          `BOTME_WIDGET_ID=${widgetId}`,
          `BOTME_TURN_HOST=${turnHost}`,
        ].join('\n') + '\n',
      );
      writeFileSync(
        join(tmpDir, 'config.json'),
        JSON.stringify(
          {
            apiUrl: `${embedOrigin}/api`,
            websocketUrl: `${wsOrigin}/socket.io`,
            operatorJsUrl: `${embedOrigin}/operator.js`,
            workspaceId,
            widgetId,
            turnHost,
            turnUdp: `turn:${turnHost}:3478?transport=udp`,
            turnTcp: `turn:${turnHost}:3478?transport=tcp`,
          },
          null,
          2,
        ),
      );

      const zipPath = join(tmpdir(), `operator-runtime-${widgetId}.zip`);
      execFileSync('zip', ['-r', zipPath, '.'], { cwd: tmpDir });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="botme-operator-runtime-${row.name.replace(/\s+/g, '-').toLowerCase()}.zip"`,
      );

      await new Promise<void>((resolve, reject) => {
        const stream = createReadStream(zipPath);
        stream.on('error', reject);
        stream.on('end', () => {
          rmSync(zipPath, { force: true });
          resolve();
        });
        stream.pipe(res);
      });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  private copyDir(src: string, dest: string): void {
    if (!existsSync(src)) {
      throw new Error('operator-runtime package not found — run export-operator-runtime.sh');
    }
    execFileSync('cp', ['-a', `${src}/.`, dest]);
  }
}
