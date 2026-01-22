'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { UserRole, AuditEvent } from '@democracy-os/shared';
import Navigation from '@/components/Navigation';

interface AuditResponse {
  data: AuditEvent[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export default function AuditTrailPage() {
  const { user, tenantSlug } = useAuthStore();
  const [page, setPage] = useState(1);
  const [eventType, setEventType] = useState<string>('all');

  apiClient.setTenant(tenantSlug);

  const { data: auditData, isLoading } = useQuery<AuditResponse>({
    queryKey: ['audit-events', tenantSlug, page, eventType],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      if (eventType !== 'all') {
        params.set('eventType', eventType);
      }
      return apiClient.get(`/api/audit?${params.toString()}`);
    },
    enabled: !!user,
  });

  const { data: integrityCheck } = useQuery<{ valid: boolean; details: any }>({
    queryKey: ['audit-integrity', tenantSlug],
    queryFn: () => apiClient.get('/api/audit/verify'),
    enabled: !!user,
  });

  // Check if user is admin
  const isAdmin = user && (
    user.role === UserRole.ADMIN ||
    user.role === UserRole.MODERATOR
  );

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
            <p className="text-gray-600 mb-4">
              Only administrators can view the audit trail.
            </p>
            <Link href="/" className="text-primary-600 hover:underline">
              Back to Home
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'vote_cast':
      case 'vote_updated':
        return '🗳️';
      case 'poll_created':
      case 'poll_updated':
        return '📊';
      case 'comment_created':
      case 'comment_updated':
        return '💬';
      case 'commitment_created':
      case 'commitment_updated':
        return '📋';
      case 'user_registered':
        return '👤';
      default:
        return '📝';
    }
  };

  const formatEventType = (eventType: string) => {
    return eventType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const eventTypes = [
    'all',
    'vote_cast',
    'vote_updated',
    'poll_created',
    'poll_updated',
    'comment_created',
    'commitment_created',
    'commitment_updated',
    'user_registered',
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Audit Trail</h1>
              <p className="text-gray-600 mt-2">
                Tamper-resistant event log with cryptographic verification
              </p>
            </div>
            <Link
              href="/admin"
              className="text-primary-600 hover:underline"
            >
              &larr; Back to Admin
            </Link>
          </div>

          {/* Integrity Status */}
          <div className={`rounded-xl p-6 mb-6 ${
            integrityCheck?.valid
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}>
            <div className="flex items-center gap-4">
              <div className="text-4xl">
                {integrityCheck?.valid ? '✅' : '❌'}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Hash Chain Integrity: {integrityCheck?.valid ? 'Verified' : 'Failed'}
                </h2>
                <p className="text-gray-600 text-sm">
                  {integrityCheck?.valid
                    ? 'All audit events are cryptographically linked and unmodified.'
                    : 'Warning: The hash chain has been broken. Some events may have been modified.'}
                </p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
            <div className="flex flex-wrap gap-4 items-center">
              <label className="text-sm font-medium text-gray-700">Filter by event:</label>
              <select
                value={eventType}
                onChange={(e) => {
                  setEventType(e.target.value);
                  setPage(1);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                {eventTypes.map((type) => (
                  <option key={type} value={type}>
                    {type === 'all' ? 'All Events' : formatEventType(type)}
                  </option>
                ))}
              </select>

              <div className="ml-auto">
                <button
                  onClick={() => {
                    window.open(`/api/audit/export?format=json`, '_blank');
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition mr-2"
                >
                  Export JSON
                </button>
                <button
                  onClick={() => {
                    window.open(`/api/audit/export?format=csv`, '_blank');
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Export CSV
                </button>
              </div>
            </div>
          </div>

          {/* Events List */}
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading audit events...</p>
            </div>
          ) : !auditData || auditData.data.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center">
              <p className="text-gray-600">No audit events found.</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Event
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Target
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Timestamp
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Hash
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {auditData.data.map((event) => (
                      <tr key={event.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <span className="text-xl">{getEventIcon(event.eventType)}</span>
                            <span className="font-medium text-gray-900">
                              {formatEventType(event.eventType)}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {event.targetType}: {event.targetId?.slice(0, 8)}...
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {new Date(event.createdAt).toLocaleString()}
                        </td>
                        <td className="px-6 py-4">
                          <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">
                            {event.payloadHash?.slice(0, 16)}...
                          </code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {auditData.pagination.totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-6">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="px-4 py-2 text-gray-600">
                    Page {page} of {auditData.pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(auditData.pagination.totalPages, p + 1))}
                    disabled={page === auditData.pagination.totalPages}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
