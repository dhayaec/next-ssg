import type { User } from "@/types/user";

export function UserCard({ user }: { user: User }) {
  return (
    <article className="user-card">
      <h2>{user.name}</h2>
      <div className="username">@{user.username}</div>
      <p className="field">
        <span className="field-label">Email: </span>
        <span className="field-value">{user.email}</span>
      </p>
      <p className="field">
        <span className="field-label">Phone: </span>
        <span className="field-value">{user.phone}</span>
      </p>
      <p className="field">
        <span className="field-label">Company: </span>
        <span className="field-value">{user.company.name}</span>
      </p>
      <p className="field">
        <span className="field-label">City: </span>
        <span className="field-value">{user.address.city}</span>
      </p>
    </article>
  );
}
