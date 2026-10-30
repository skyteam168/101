import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERM_KEY = 'require_perm';

/** 接口所需权限码，如 order:cancel */
export const RequirePerm = (...perms: string[]) => SetMetadata(REQUIRE_PERM_KEY, perms);
