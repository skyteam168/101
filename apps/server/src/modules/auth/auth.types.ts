export type AuthUser = {
  id: string;
  username: string;
  storeId: string | null;
  roles: string[];
  isSuperAdmin: boolean;
};

export type JwtPayload = {
  sub: string;
  username: string;
  typ: 'access' | 'refresh';
  jti?: string;
};
