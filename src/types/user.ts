export interface User {
  id: number;
  name: string;
  username: string;
  email: string;
  phone: string;
  website: string;
  company: { name: string };
  address: {
    street: string;
    suite: string;
    city: string;
    zipcode: string;
  };
}
