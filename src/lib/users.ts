import type { User } from "@/types/user";

export async function getUsers(): Promise<User[]> {
  const res = await fetch("https://jsonplaceholder.typicode.com/users", {
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json() as Promise<User[]>;
}
