'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { UserRole } from '@democracy-os/shared';
import Navigation from '@/components/Navigation';

interface DashboardStats {
  totalPolls: number;
  activePolls: number;
  totalVotes: number;
  totalComments: number;
  pendingReports: number;
  totalUsers: number;
}

export default function AdminDashboardPage() {
  const { user, tenantSlug } = useAuthStore();

  apiClient.setTenant(tenantSlug);

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ['admin-stats', tenantSlug],
    queryFn: () => apiClient.get('/api/admin/stats'),
    enabled: !!user,
  });

  // Check if user is admin
  const isAdmin = user && (
    user.role === UserRole.ADMIN ||
    user.role === UserRole.MODERATOR ||
    user.role === UserRole.OFFICIAL
  );

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
            <p className="text-gray-600 mb-4">Please log in to access the admin area.</p>
            <Link href="/login" className="text-primary-600 hover:underline">
              Go to Login
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
            <p className="text-gray-600 mb-4">
              You don't have permission to access the admin area.
            </p>
            <Link href="/" className="text-primary-600 hover:underline">
              Back to Home
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const adminCards = [
    {
      title: 'Content Moderation',
      description: 'Review and manage reported comments',
      href: '/admin/moderation',
      icon: '🛡️',
      stat: stats?.pendingReports || 0,
      statLabel: 'pending reports',
      color: 'bg-red-50 border-red-200',
    },
    {
      title: 'Polls Management',
      description: 'View and manage all polls',
      href: '/polls',
      icon: '📊',
      stat: stats?.activePolls || 0,
      statLabel: 'active polls',
      color: 'bg-blue-50 border-blue-200',
    },
    {
      title: 'Commitments',
      description: 'Manage government commitments',
      href: '/commitments',
      icon: '📋',
      stat: null,
      statLabel: null,
      color: 'bg-green-50 border-green-200',
    },
    {
      title: 'Audit Trail',
      description: 'View system audit logs',
      href: '/admin/audit',
      icon: '📜',
      stat: null,
      statLabel: null,
      color: 'bg-purple-50 border-purple-200',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-600 mt-2">
              Welcome back, {user.displayName}. Manage your platform here.
            </p>
          </div>

          {/* Quick Stats */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-white rounded-xl shadow-sm p-6 text-center">
                <div className="text-3xl font-bold text-primary-600">{stats.totalPolls}</div>
                <div className="text-sm text-gray-600">Total Polls</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-6 text-center">
                <div className="text-3xl font-bold text-green-600">{stats.totalVotes}</div>
                <div className="text-sm text-gray-600">Total Votes</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-6 text-center">
                <div className="text-3xl font-bold text-blue-600">{stats.totalComments}</div>
                <div className="text-sm text-gray-600">Total Comments</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-6 text-center">
                <div className="text-3xl font-bold text-purple-600">{stats.totalUsers}</div>
                <div className="text-sm text-gray-600">Users</div>
              </div>
            </div>
          )}

          {/* Admin Cards */}
          <div className="grid md:grid-cols-2 gap-6">
            {adminCards.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className={`${card.color} border rounded-xl p-6 hover:shadow-md transition block`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-3xl mb-3">{card.icon}</div>
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">
                      {card.title}
                    </h2>
                    <p className="text-gray-600">{card.description}</p>
                  </div>
                  {card.stat !== null && (
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gray-900">{card.stat}</div>
                      <div className="text-sm text-gray-500">{card.statLabel}</div>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {/* Role Info */}
          <div className="mt-8 bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Role: {user.role}</h2>
            <p className="text-gray-600">
              {user.role === UserRole.ADMIN && (
                'As an administrator, you have full access to all platform features including user management and system configuration.'
              )}
              {user.role === UserRole.OFFICIAL && (
                'As an elected official, you can create official consultations and manage government commitments.'
              )}
              {user.role === UserRole.MODERATOR && (
                'As a moderator, you can review reported content and manage community discussions.'
              )}
              {user.role === UserRole.CITIZEN && (
                'As a citizen, you can participate in polls, submit ideas, and engage in discussions.'
              )}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
