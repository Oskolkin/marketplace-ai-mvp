export type UserDto = {
  id: number;
  email: string;
  status: string;
};

export type SellerAccountDto = {
  id: number;
  name: string;
  status: string;
};

export type AuthResponse = {
  user: UserDto;
  seller_account: SellerAccountDto | null;
  is_admin: boolean;
};

export type RegisterRequest = {
  email: string;
  password: string;
  password_confirm: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};
