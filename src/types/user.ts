export enum Role {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

export interface User {
  id: string;
  username: string;
  email: string;
  password: string;
  role: Role;
  profile_picture?: string;
  verification_token?: string;
  verified?: boolean;
  verified_at?: Date;
  created_at: Date;
  updated_at: Date;
}
