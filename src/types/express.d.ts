import { User } from './user';

declare global {
  declare namespace Express {
    export interface Request {
      user: Pick<User, 'id' | 'name' | 'email' | 'profile_picture_url' | 'role'>;
    }
  }
}
