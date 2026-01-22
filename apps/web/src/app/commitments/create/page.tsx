'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { CommitmentStatus, UserRole } from '@democracy-os/shared';
import Navigation from '@/components/Navigation';

interface CreateCommitmentData {
  title: string;
  description?: string;
  responsibleParty?: string;
  plannedBudget?: number;
  targetDate?: string;
  status: CommitmentStatus;
}

export default function CreateCommitmentPage() {
  const router = useRouter();
  const { user, tenantSlug } = useAuthStore();
  const [error, setError] = useState('');

  const [formData, setFormData] = useState<CreateCommitmentData>({
    title: '',
    description: '',
    responsibleParty: '',
    plannedBudget: undefined,
    targetDate: '',
    status: CommitmentStatus.PLANNED,
  });

  apiClient.setTenant(tenantSlug);

  const createMutation = useMutation({
    mutationFn: (data: CreateCommitmentData) =>
      apiClient.post('/api/commitments', data),
    onSuccess: () => {
      router.push('/commitments');
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to create commitment');
    },
  });

  // Check if user can create commitments
  const canCreate = user && (
    user.role === UserRole.ADMIN ||
    user.role === UserRole.OFFICIAL ||
    user.role === UserRole.MODERATOR
  );

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
            <p className="text-gray-600 mb-4">Please log in to create commitments.</p>
            <Link href="/login" className="text-primary-600 hover:underline">
              Go to Login
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!canCreate) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
            <p className="text-gray-600 mb-4">
              Only officials and administrators can create government commitments.
            </p>
            <Link href="/commitments" className="text-primary-600 hover:underline">
              Back to Commitments
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.title.trim()) {
      setError('Title is required');
      return;
    }

    const submitData: any = {
      title: formData.title.trim(),
      status: formData.status,
    };

    if (formData.description?.trim()) {
      submitData.description = formData.description.trim();
    }
    if (formData.responsibleParty?.trim()) {
      submitData.responsibleParty = formData.responsibleParty.trim();
    }
    if (formData.plannedBudget) {
      submitData.plannedBudget = formData.plannedBudget;
    }
    if (formData.targetDate) {
      submitData.targetDate = formData.targetDate;
    }

    createMutation.mutate(submitData);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <Link
              href="/commitments"
              className="text-primary-600 hover:text-primary-700 transition"
            >
              &larr; Back to Commitments
            </Link>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">
              Create Government Commitment
            </h1>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder="e.g., Build new community center"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  maxLength={200}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Provide details about this commitment..."
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                  maxLength={2000}
                />
              </div>

              {/* Responsible Party */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Responsible Party
                </label>
                <input
                  type="text"
                  value={formData.responsibleParty}
                  onChange={(e) =>
                    setFormData({ ...formData, responsibleParty: e.target.value })
                  }
                  placeholder="e.g., Department of Public Works"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              {/* Budget and Target Date - Side by side */}
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Planned Budget (EUR)
                  </label>
                  <input
                    type="number"
                    value={formData.plannedBudget || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        plannedBudget: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    placeholder="e.g., 500000"
                    min="0"
                    step="1000"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Target Date
                  </label>
                  <input
                    type="date"
                    value={formData.targetDate}
                    onChange={(e) =>
                      setFormData({ ...formData, targetDate: e.target.value })
                    }
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      status: e.target.value as CommitmentStatus,
                    })
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value={CommitmentStatus.PLANNED}>Planned</option>
                  <option value={CommitmentStatus.IN_PROGRESS}>In Progress</option>
                  <option value={CommitmentStatus.DELIVERED}>Delivered</option>
                  <option value={CommitmentStatus.CANCELLED}>Cancelled</option>
                </select>
              </div>

              {/* Submit Button */}
              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => router.push('/commitments')}
                  className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Commitment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
