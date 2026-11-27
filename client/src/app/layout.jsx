import './globals.css';
import { AuthProvider } from '@/providers/AuthProvider';
import { ToastProvider } from '@/providers/ToastProvider';

export const metadata = {
  title: 'Bluebill — Refilling Station',
  description: 'Water station management: point of sale, inventory, staff quotas and reports.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      {/* impeccable-disable overused-font: brand typography */}
      <body>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
