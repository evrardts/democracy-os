'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { Commitment, CommitmentStatus, UserRole } from '@democracy-os/shared';
import Navigation from '@/components/Navigation';

export default function CommitmentDetailPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const { user, tenantSlug } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Commitment>>({});

  const commitmentId = params.id as string;

  apiClient.setTenant(tenantSlug);

  const { data: commitment, isLoading } = useQuery<Commitment>({
    queryKey: ['commitment', commitmentId],
    queryFn: () => apiClient.get(`/api/commitments/${commitmentId}`),
  });

  const { data: history } = useQuery<Commitment[]>({
    queryKey: ['commitment-history', commitmentId],
    queryFn: () => apiClient.get(`/api/commitments/${commitmentId}/history`),
    enabled: !!commitment,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Commitment>) =>
      apiClient.put(`/api/commitments/${commitmentId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commitment', commitmentId] });
      queryClient.invalidateQueries({ queryKey: ['commitment-history', commitmentId] });
      setIsEditing(false);
    },
  });

  const canEdit = user && (
    user.role === UserRole.ADMIN ||
    user.role === UserRole.OFFICIAL ||
    user.role === UserRole.MODERATOR
  );

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

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading commitment...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!commitment) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Commitment Not Found</h1>
            <Link href="/commitments" className="text-primary-600 hover:underline">
              Back to Commitments
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const handleEdit = () => {
    setEditData({
      title: commitment.title,
      description: commitment.description,
      responsibleParty: commitment.responsibleParty,
      plannedBudget: commitment.plannedBudget,
      actualBudget: commitment.actualBudget,
      targetDate: commitment.targetDate,
      status: commitment.status,
    });
    setIsEditing(true);
  };

  const handleSave = () => {
    updateMutation.mutate(editData);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <Link
              href="/commitments"
              className="text-primary-600 hover:text-primary-700 transition"
            >
              &larr; Back to Commitments
            </Link>
          </div>

          {/* Main Content */}
          <div className="bg-white rounded-xl shadow-sm p-8 mb-8">
            <div className="flex justify-between items-start mb-6">
              {isEditing ? (
                <input
                  type="text"
                  value={editData.title || ''}
                  onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                  className="text-2xl font-bold text-gray-900 border-b-2 border-primary-500 focus:outline-none w-full"
                />
              ) : (
                <h1 className="text-2xl font-bold text-gray-900">{commitment.title}</h1>
              )}

              {isEditing ? (
                <select
                  value={editData.status}
                  onChange={(e) => setEditData({ ...editData, status: e.target.value as CommitmentStatus })}
                  className="px-3 py-1 border rounded-lg"
                >
                  <option value="planned">Planned</option>
                  <option value="in_progress">In Progress</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              ) : (
                <span className={`px-4 py-2 rounded-full text-sm font-semibold ${getStatusColor(commitment.status)}`}>
                  {commitment.status.replace('_', ' ')}
                </span>
              )}
            </div>

            {/* Description */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Description</h3>
              {isEditing ? (
                <textarea
                  value={editData.description || ''}
                  onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              ) : (
                <p className="text-gray-700">{commitment.description || 'No description provided.'}</p>
              )}
            </div>

            {/* Details Grid */}
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Responsible Party</h3>
                {isEditing ? (
                  <input
                    type="text"
                    value={editData.responsibleParty || ''}
                    onChange={(e) => setEditData({ ...editData, responsibleParty: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                ) : (
                  <p className="text-gray-700">{commitment.responsibleParty || 'Not specified'}</p>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Target Date</h3>
                {isEditing ? (
                  <input
                    type="date"
                    value={editData.targetDate ? new Date(editData.targetDate).toISOString().split('T')[0] : ''}
                    onChange={(e) => setEditData({ ...editData, targetDate: e.target.value ? new Date(e.target.value) : undefined })}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                ) : (
                  <p className="text-gray-700">
                    {commitment.targetDate ? formatDate(commitment.targetDate) : 'Not specified'}
                  </p>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Planned Budget</h3>
                {isEditing ? (
                  <input
                    type="number"
                    value={editData.plannedBudget || ''}
                    onChange={(e) => setEditData({ ...editData, plannedBudget: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                ) : (
                  <p className="text-gray-700">
                    {commitment.plannedBudget ? formatCurrency(commitment.plannedBudget) : 'Not specified'}
                  </p>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Actual Budget</h3>
                {isEditing ? (
                  <input
                    type="number"
                    value={editData.actualBudget || ''}
                    onChange={(e) => setEditData({ ...editData, actualBudget: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                ) : (
                  <p className="text-gray-700">
                    {commitment.actualBudget ? formatCurrency(commitment.actualBudget) : 'Not yet recorded'}
                  </p>
                )}
              </div>
            </div>

            {/* Version Info */}
            <div className="border-t pt-4 text-sm text-gray-500">
              Version {commitment.version} &bull; Created {formatDate(commitment.createdAt)}
            </div>

            {/* Edit/Save Buttons */}
            {canEdit && (
              <div className="mt-6 flex gap-4">
                {isEditing ? (
                  <>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={updateMutation.isPending}
                      className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
                    >
                      {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleEdit}
                    className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
                  >
                    Edit Commitment
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Version History */}
          {history && history.length > 1 && (
            <div className="bg-white rounded-xl shadow-sm p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Version History</h2>
              <div className="space-y-4">
                {history.map((version, index) => (
                  <div
                    key={version.id}
                    className={`p-4 rounded-lg border ${index === 0 ? 'border-primary-200 bg-primary-50' : 'border-gray-200'}`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-semibold">Version {version.version}</span>
                        {index === 0 && (
                          <span className="ml-2 text-xs bg-primary-600 text-white px-2 py-1 rounded">
                            Current
                          </span>
                        )}
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(version.status)}`}>
                        {version.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-2">{version.title}</p>
                    <p className="text-xs text-gray-400 mt-2">
                      {formatDate(version.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
