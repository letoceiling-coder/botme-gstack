import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { LoginSchema, RegisterSchema, SwitchWorkspaceSchema } from '@botme/shared';
import { AllowCrossWorkspace } from '../../../core/decorators/allow-cross-workspace.decorator';
import { CurrentUser } from '../../../core/decorators/current-user.decorator';
import { Public } from '../../../core/decorators/public.decorator';
import type { AuthenticatedRequest } from '../../../core/decorators/current-user.decorator';
import { AuthService } from '../application/auth.service';

@Controller('auth')
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  async register(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = RegisterSchema.parse(body);
    const session = await this.auth.register(input);
    this.setAuthCookies(res, session.accessToken, session.refreshToken);
    return {
      user: session.user,
      workspace: session.workspace,
      workspaces: session.workspaces,
      expiresIn: session.expiresIn,
    };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = LoginSchema.parse(body);
    const session = await this.auth.login(input);
    this.setAuthCookies(res, session.accessToken, session.refreshToken);
    return {
      user: session.user,
      workspace: session.workspace,
      workspaces: session.workspaces,
      expiresIn: session.expiresIn,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    const token =
      (req.body as { refreshToken?: string })?.refreshToken ??
      (req.cookies?.['refresh_token'] as string | undefined);
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      throw new UnauthorizedException('Refresh token не предоставлен');
    }
    const session = await this.auth.refresh(token.trim());
    this.setAuthCookies(res, session.accessToken, session.refreshToken);
    return {
      user: session.user,
      workspace: session.workspace,
      workspaces: session.workspaces,
      expiresIn: session.expiresIn,
    };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.['refresh_token'] as string | undefined;
    await this.auth.logout(token);
    this.clearAuthCookies(res);
    return { ok: true };
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.auth.me(user.sub, user.workspaceId);
  }

  @Post('switch-workspace')
  @AllowCrossWorkspace()
  @HttpCode(200)
  async switchWorkspace(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = SwitchWorkspaceSchema.parse(body);
    const session = await this.auth.switchWorkspace(user.sub, input.workspaceId);
    this.setAuthCookies(res, session.accessToken, session.refreshToken);
    return {
      user: session.user,
      workspace: session.workspace,
      workspaces: session.workspaces,
      expiresIn: session.expiresIn,
    };
  }

  private cookieOptions(): {
    httpOnly: true;
    secure: boolean;
    sameSite: 'lax';
    path: '/';
    domain?: string;
  } {
    const isProd = process.env['NODE_ENV'] === 'production';
    const domain = process.env['COOKIE_DOMAIN']?.trim();
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      ...(domain ? { domain } : {}),
    };
  }

  private setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
    const common = this.cookieOptions();
    const accessTtl = Number(process.env['JWT_ACCESS_TTL'] ?? 900);
    const refreshTtl = Number(process.env['JWT_REFRESH_TTL'] ?? 604800);
    res.cookie('access_token', accessToken, {
      ...common,
      maxAge: accessTtl * 1000,
    });
    res.cookie('refresh_token', refreshToken, {
      ...common,
      maxAge: refreshTtl * 1000,
    });
  }

  private clearAuthCookies(res: Response): void {
    const common = this.cookieOptions();
    res.clearCookie('access_token', common);
    res.clearCookie('refresh_token', common);
  }
}
