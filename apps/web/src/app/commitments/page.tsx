'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { Commitment, UserRole } from '@democracy-os/shared';
import Navigation from '@/components/Navigation';

export default function CommitmentsPage() {
  const { tenantSlug, user } = useAuthStore();

  apiClient.setTenant(tenantSlug);

  const { data: commitments, isLoading } = useQuery<Commitment[]>({
    queryKey: ['commitments', tenantSlug],
    queryFn: () => apiClient.get('/api/commitments'),
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planned':
        return 'bg-blue-100 text-blue-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'delivered':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const canCreateCommitment = user && (
    user.role === UserRole.ADMIN ||
    user.role === UserRole.OFFICIAL ||
    user.role === UserRole.MODERATOR
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Government Commitments</h1>
          {canCreateCommitment && (
            <Link
              href="/commitments/create"
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
            >
              + Create Commitment
            </Link>
          )}
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading commitments...</p>
          </div>
        ) : commitments && commitments.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 text-lg">No commitments yet</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {commitments?.map((commitment) => (
              <Link
                key={commitment.id}
                href={`/commitments/${commitment.id}`}
                className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition block"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-xl font-semibold text-gray-900 flex-1">
                    {commitment.title}
                  </h3>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(
                      commitment.status
                    )}`}
                  >
                    {commitment.status.replace('_', ' ')}
                  </span>
                </div>

                {commitment.description && (
                  <p className="text-gray-600 mb-4 line-clamp-3">{commitment.description}</p>
                )}

                {commitment.responsibleParty && (
                  <div className="text-sm text-gray-500 mb-2">
                    <span className="font-semibold">Responsible:</span> {commitment.responsibleParty}
                  </div>
                )}

                {commitment.plannedBudget && (
                  <div className="text-sm text-gray-500 mb-2">
                    <span className="font-semibold">Budget:</span> €
                    {commitment.plannedBudget.toLocaleString()}
                  </div>
                )}

                {commitment.targetDate && (
                  <div className="text-sm text-gray-500 mb-2">
                    <span className="font-semibold">Target:</span>{' '}
                    {new Date(commitment.targetDate).toLocaleDateString()}
                  </div>
                )}

                <div className="mt-4 pt-4 border-t text-sm text-gray-500">
                  Version {commitment.version} •{' '}
                  {new Date(commitment.createdAt).toLocaleDateString()}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
