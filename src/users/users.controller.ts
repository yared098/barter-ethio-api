import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateTierDto } from './dto/update-tier.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // ─── Self (order matters: /me must come before /:id) ───

  @Get('me')
  getMe(@CurrentUser('id') userId: string) {
    return this.users.getMe(userId);
  }

  @Patch('me')
  updateMe(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.users.updateMe(userId, dto);
  }

  @Delete('me')
  deactivateMe(@CurrentUser('id') userId: string) {
    return this.users.deactivateMe(userId);
  }

  // ─── Admin: must be ABOVE /:id route ───

  @Roles('ADMIN')
  @Get()
  list(@Query() query: ListUsersQueryDto) {
    return this.users.listUsers(query);
  }

  @Roles('ADMIN')
  @Patch(':id/tier')
  updateTier(@Param('id') id: string, @Body() dto: UpdateTierDto) {
    return this.users.updateTier(id, dto);
  }

  @Roles('ADMIN')
  @Patch(':id/role')
  updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.users.updateRole(id, dto);
  }

  @Roles('ADMIN')
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.users.updateStatus(id, dto);
  }

  // ─── Public: must be LAST so /me and admin routes match first ───

  @Public()
  @Get(':id')
  getPublic(@Param('id') id: string) {
    return this.users.getPublicProfile(id);
  }

  @Public()
  @Get(':id/products')
  getUserProducts(@Param('id') id: string) {
    return this.users.getUserProducts(id);
  }
}