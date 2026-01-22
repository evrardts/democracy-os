'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { Poll, PollStatus, UserRole } from '@democracy-os/shared';
import Navigation from '@/components/Navigation';

export default function ConsultationsPage() {
  const { tenantSlug, user } = useAuthStore();

  apiClient.setTenant(tenantSlug);

  // Fetch multi-stage polls (consultations)
  const { data: consultationsResponse, isLoading } = useQuery<{ data: Poll[]; pagination: any }>({
    queryKey: ['consultations', tenantSlug],
    queryFn: () => apiClient.get('/api/polls?type=multi_stage'),
  });

  const consultations = consultationsResponse?.data;

  const canCreate = user && (
    user.role === UserRole.ADMIN ||
    user.role === UserRole.OFFICIAL ||
    user.role === UserRole.MODERATOR
  );

  const getStatusBadge = (status: PollStatus) => {
    switch (status) {
      case PollStatus.DRAFT:
        return 'bg-gray-100 text-gray-800';
      case PollStatus.ACTIVE:
        return 'bg-green-100 text-green-800';
      case PollStatus.CLOSED:
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStageName = (stage?: string) => {
    switch (stage) {
      case 'idea_collection':
        return 'Stage 1: Idea Collection';
      case 'shortlist_selection':
        return 'Stage 2: Shortlist Selection';
      case 'final_arbitration':
        return 'Stage 3: Final Vote';
      default:
        return 'Not Started';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Multi-Stage Consultations</h1>
            <p className="text-gray-600 mt-2">
              Complex consultations with idea collection, shortlisting, and final voting
            </p>
          </div>
          {canCreate && (
            <Link
              href="/consultations/create"
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
            >
              + Create Consultation
            </Link>
          )}
        </div>

        {/* How it works */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">How Multi-Stage Consultations Work</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-3">
                1
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Idea Collection</h3>
              <p className="text-sm text-gray-600">
                Citizens submit their ideas and proposals for the consultation topic
              </p>
            </div>
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-3">
                2
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Shortlist Selection</h3>
              <p className="text-sm text-gray-600">
                Community votes to select the top ideas for the final round
              </p>
            </div>
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-3">
                3
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Final Decision</h3>
              <p className="text-sm text-gray-600">
                Final vote on shortlisted ideas to determine the winning proposal
              </p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading consultations...</p>
          </div>
        ) : consultations && consultations.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl shadow-sm">
            <div className="text-6xl mb-4">🗳️</div>
            <p className="text-gray-600 text-lg mb-4">No consultations yet</p>
            {canCreate && (
              <Link
                href="/consultations/create"
                className="text-primary-600 hover:underline"
              >
                Create the first consultation →
              </Link>
            )}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {consultations?.map((consultation) => (
              <Link
                key={consultation.id}
                href={`/consultations/${consultation.id}`}
                className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition block"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-xl font-semibold text-gray-900 flex-1">
                    {consultation.title}
                  </h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(consultation.status)}`}>
                    {consultation.status}
                  </span>
                </div>

                {consultation.description && (
                  <p className="text-gray-600 mb-4 line-clamp-2">{consultation.description}</p>
                )}

                <div className="flex items-center justify-between text-sm">
                  <span className="text-primary-600 font-medium">
                    {getStageName((consultation as any).currentStage)}
                  </span>
                  <span className="text-gray-500">
                    {new Date(consultation.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
