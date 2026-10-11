import { AdminApp } from "@/components/admin/AdminApp";
import "./host.css";
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AdminApp />
      {children}
    </>
  );
}
