'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/lib/auth-store';
import { apiClient } from '@/lib/api-client';
import LanguageSwitcher from './LanguageSwitcher';

interface NavigationProps {
  showAuth?: boolean;
}

export default function Navigation({ showAuth = true }: NavigationProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();

  const handleLogout = async () => {
    await apiClient.post('/api/auth/logout');
    clearAuth();
    router.push('/');
  };

  return (
    <nav className="border-b bg-white">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-primary-600">
            {t('app.name')}
          </Link>

          <div className="flex items-center gap-6">
            <Link
              href="/polls"
              className="text-gray-700 hover:text-primary-600 transition"
            >
              {t('nav.polls')}
            </Link>
            <Link
              href="/consultations"
              className="text-gray-700 hover:text-primary-600 transition"
            >
              Consultations
            </Link>
            <Link
              href="/commitments"
              className="text-gray-700 hover:text-primary-600 transition"
            >
              {t('nav.commitments')}
            </Link>

            <LanguageSwitcher />

            {showAuth && (
              <>
                {user ? (
                  <div className="flex items-center gap-4">
                    <span className="text-gray-600 hidden md:inline">
                      {user.displayName}
                    </span>
                    <button
                      onClick={handleLogout}
                      className="px-4 py-2 text-gray-700 hover:text-red-600 transition"
                    >
                      {t('nav.logout')}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Link
                      href="/login"
                      className="px-4 py-2 text-gray-700 hover:text-primary-600 transition"
                    >
                      {t('nav.login')}
                    </Link>
                    <Link
                      href="/register"
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
                    >
                      {t('nav.register')}
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
