'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { UserRole } from '@democracy-os/shared';
import Navigation from '@/components/Navigation';

interface ConsultationFormData {
  title: string;
  description: string;
  category: string;
  startsAt: string;
  endsAt: string;
  stageConfig: {
    ideaCollectionDays: number;
    shortlistSelectionDays: number;
    finalVotingDays: number;
    maxIdeasPerUser: number;
    shortlistSize: number;
  };
}

export default function CreateConsultationPage() {
  const router = useRouter();
  const { user, tenantSlug } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  apiClient.setTenant(tenantSlug);

  const [formData, setFormData] = useState<ConsultationFormData>({
    title: '',
    description: '',
    category: '',
    startsAt: '',
    endsAt: '',
    stageConfig: {
      ideaCollectionDays: 14,
      shortlistSelectionDays: 7,
      finalVotingDays: 7,
      maxIdeasPerUser: 3,
      shortlistSize: 5,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      // Step 1: Create the poll with multi_stage type
      const poll = await apiClient.post<{ id: string }>('/api/polls', {
        title: data.title,
        description: data.description,
        category: data.category,
        pollType: 'multi_stage',
        options: [], // Will be populated in stage 3
        startTime: data.startsAt,
        endTime: data.endsAt,
      });

      // Step 2: Calculate stage dates based on config
      const startDate = new Date(data.startsAt);
      const stage1End = new Date(startDate);
      stage1End.setDate(stage1End.getDate() + data.stageConfig.ideaCollectionDays);

      const stage2Start = new Date(stage1End);
      const stage2End = new Date(stage2Start);
      stage2End.setDate(stage2End.getDate() + data.stageConfig.shortlistSelectionDays);

      const stage3Start = new Date(stage2End);
      const stage3End = new Date(stage3Start);
      stage3End.setDate(stage3End.getDate() + data.stageConfig.finalVotingDays);

      // Step 3: Create the consultation stages
      await apiClient.post('/api/consultations/create-stages', {
        pollId: poll.id,
        stage1Start: startDate.toISOString(),
        stage1End: stage1End.toISOString(),
        stage2Start: stage2Start.toISOString(),
        stage2End: stage2End.toISOString(),
        stage3Start: stage3Start.toISOString(),
        stage3End: stage3End.toISOString(),
        minIdeasForStage2: 10,
        shortlistSize: data.stageConfig.shortlistSize,
      });

      return poll;
    },
    onSuccess: (result: any) => {
      router.push(`/consultations/${result.id}`);
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to create consultation');
    },
  });

  // Check permissions
  const canCreate = user && (
    user.role === UserRole.ADMIN ||
    user.role === UserRole.OFFICIAL ||
    user.role === UserRole.MODERATOR
  );

  if (!user || !canCreate) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
            <p className="text-gray-600 mb-4">
              Only officials and administrators can create consultations.
            </p>
            <Link href="/consultations" className="text-primary-600 hover:underline">
              Back to Consultations
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.title.trim()) {
      setError('Title is required');
      return;
    }

    if (!formData.startsAt) {
      setError('Start date is required');
      return;
    }

    createMutation.mutate({
      title: formData.title,
      description: formData.description,
      category: formData.category || 'general',
      startsAt: formData.startsAt,
      endsAt: formData.endsAt || null,
      stageConfig: formData.stageConfig,
    });
  };

  const updateStageConfig = (key: keyof typeof formData.stageConfig, value: number) => {
    setFormData(prev => ({
      ...prev,
      stageConfig: {
        ...prev.stageConfig,
        [key]: value,
      },
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Create Consultation</h1>
              <p className="text-gray-600 mt-2">
                Set up a multi-stage consultation for community input
              </p>
            </div>
            <Link
              href="/consultations"
              className="text-primary-600 hover:underline"
            >
              &larr; Back to Consultations
            </Link>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Basic Information */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>

              <div className="space-y-4">
                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                    Consultation Title *
                  </label>
                  <input
                    type="text"
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="e.g., Downtown Revitalization Project"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Describe the purpose and goals of this consultation..."
                  />
                </div>

                <div>
                  <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    id="category"
                    value={formData.category}
                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">Select a category</option>
                    <option value="infrastructure">Infrastructure</option>
                    <option value="environment">Environment</option>
                    <option value="education">Education</option>
                    <option value="healthcare">Healthcare</option>
                    <option value="transportation">Transportation</option>
                    <option value="housing">Housing</option>
                    <option value="public_safety">Public Safety</option>
                    <option value="economy">Economy & Jobs</option>
                    <option value="culture">Culture & Recreation</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Timeline</h2>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="startsAt" className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date *
                  </label>
                  <input
                    type="datetime-local"
                    id="startsAt"
                    value={formData.startsAt}
                    onChange={(e) => setFormData(prev => ({ ...prev, startsAt: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="endsAt" className="block text-sm font-medium text-gray-700 mb-1">
                    End Date (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    id="endsAt"
                    value={formData.endsAt}
                    onChange={(e) => setFormData(prev => ({ ...prev, endsAt: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Leave empty to use stage durations below
                  </p>
                </div>
              </div>
            </div>

            {/* Stage Configuration */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Stage Configuration</h2>
              <p className="text-gray-600 text-sm mb-6">
                Configure the duration and settings for each consultation stage
              </p>

              <div className="space-y-6">
                {/* Stage 1: Idea Collection */}
                <div className="border-l-4 border-blue-500 pl-4">
                  <h3 className="font-medium text-gray-900 mb-3">Stage 1: Idea Collection</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Duration (days)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="90"
                        value={formData.stageConfig.ideaCollectionDays}
                        onChange={(e) => updateStageConfig('ideaCollectionDays', parseInt(e.target.value) || 14)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Max ideas per user
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={formData.stageConfig.maxIdeasPerUser}
                        onChange={(e) => updateStageConfig('maxIdeasPerUser', parseInt(e.target.value) || 3)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                {/* Stage 2: Shortlist Selection */}
                <div className="border-l-4 border-yellow-500 pl-4">
                  <h3 className="font-medium text-gray-900 mb-3">Stage 2: Shortlist Selection</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Duration (days)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="90"
                        value={formData.stageConfig.shortlistSelectionDays}
                        onChange={(e) => updateStageConfig('shortlistSelectionDays', parseInt(e.target.value) || 7)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Shortlist size
                      </label>
                      <input
                        type="number"
                        min="2"
                        max="20"
                        value={formData.stageConfig.shortlistSize}
                        onChange={(e) => updateStageConfig('shortlistSize', parseInt(e.target.value) || 5)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Number of top ideas to advance to final voting
                      </p>
                    </div>
                  </div>
                </div>

                {/* Stage 3: Final Voting */}
                <div className="border-l-4 border-green-500 pl-4">
                  <h3 className="font-medium text-gray-900 mb-3">Stage 3: Final Voting</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Duration (days)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="90"
                      value={formData.stageConfig.finalVotingDays}
                      onChange={(e) => updateStageConfig('finalVotingDays', parseInt(e.target.value) || 7)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Total Duration Summary */}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-700">
                  <span className="font-medium">Total estimated duration:</span>{' '}
                  {formData.stageConfig.ideaCollectionDays +
                   formData.stageConfig.shortlistSelectionDays +
                   formData.stageConfig.finalVotingDays} days
                </p>
              </div>
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-4">
              <Link
                href="/consultations"
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Consultation'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
