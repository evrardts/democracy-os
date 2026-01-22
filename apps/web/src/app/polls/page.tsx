'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { Poll, PaginatedResponse } from '@democracy-os/shared';

export default function PollsPage() {
  const router = useRouter();
  const { user, tenantSlug, clearAuth } = useAuthStore();

  apiClient.setTenant(tenantSlug);

  const { data, isLoading, error } = useQuery<PaginatedResponse<Poll>>({
    queryKey: ['polls', tenantSlug],
    queryFn: () => apiClient.get('/api/polls', { status: 'active' }),
  });

  const handleLogout = async () => {
    await apiClient.post('/api/auth/logout');
    clearAuth();
    router.push('/');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading polls...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">Failed to load polls</p>
          <button
            onClick={() => router.push('/')}
            className="mt-4 text-primary-600 hover:text-primary-700"
          >
            Go back home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-primary-600">
            Democracy OS
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/polls" className="text-gray-700 hover:text-primary-600">
              Polls
            </Link>
            <Link href="/commitments" className="text-gray-700 hover:text-primary-600">
              Commitments
            </Link>
            {user && (
              <>
                <span className="text-gray-600">Hello, {user.displayName}</span>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 text-gray-700 hover:text-red-600"
                >
                  Logout
                </button>
              </>
            )}
            {!user && (
              <Link
                href="/login"
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Active Polls</h1>
          {user && (
            <Link
              href="/polls/create"
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              Create Poll
            </Link>
          )}
        </div>

        {data && data.data.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 text-lg">No active polls at the moment</p>
            {user && (
              <Link
                href="/polls/create"
                className="inline-block mt-4 text-primary-600 hover:text-primary-700 font-semibold"
              >
                Create the first poll →
              </Link>
            )}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data?.data.map((poll) => (
              <Link
                key={poll.id}
                href={`/polls/${poll.id}`}
                className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition"
              >
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {poll.title}
                </h3>
                {poll.description && (
                  <p className="text-gray-600 mb-4 line-clamp-2">{poll.description}</p>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">
                    {poll.options.length} options
                  </span>
                  <span className="text-primary-600 font-semibold">Vote →</span>
                </div>
                {poll.tags && poll.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {poll.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
