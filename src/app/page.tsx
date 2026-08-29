import { getUsers } from "@/lib/users";
import { UserCard } from "@/components/UserCard";

export default async function HomePage() {
  const users = await getUsers();

  return (
    <main className="container">
      <h1>Users List</h1>
      <section className="users-grid" aria-label="User list">
        {users.map((user) => (
          <UserCard key={user.id} user={user} />
        ))}
      </section>
    </main>
  );
}
