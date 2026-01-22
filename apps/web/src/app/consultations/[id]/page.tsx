'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import Navigation from '@/components/Navigation';
import {
  ConsultationStageInfo,
  ConsultationIdeaWithAuthor,
  PaginatedResponse,
  Poll,
} from '@democracy-os/shared';

type SortType = 'score' | 'newest';

export default function ConsultationPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user, tenantSlug } = useAuthStore();
  const [sortBy, setSortBy] = useState<SortType>('score');
  const [ideaTitle, setIdeaTitle] = useState('');
  const [ideaDescription, setIdeaDescription] = useState('');
  const [showIdeaForm, setShowIdeaForm] = useState(false);

  const pollId = params.id as string;
  apiClient.setTenant(tenantSlug);

  // Fetch poll details
  const { data: poll } = useQuery<Poll>({
    queryKey: ['poll', pollId],
    queryFn: () => apiClient.get(`/api/polls/${pollId}`),
  });

  // Fetch stage information
  const { data: stageInfo } = useQuery<ConsultationStageInfo>({
    queryKey: ['consultation', pollId, 'stage'],
    queryFn: () => apiClient.get(`/api/consultations/${pollId}/stage`),
    enabled: !!poll && poll.pollType === 'multi_stage',
  });

  // Fetch ideas
  const { data: ideasResponse } = useQuery<PaginatedResponse<ConsultationIdeaWithAuthor>>({
    queryKey: ['consultation', pollId, 'ideas', sortBy],
    queryFn: () => apiClient.get(`/api/consultations/${pollId}/ideas?sort=${sortBy}&limit=50`),
    enabled: !!stageInfo,
  });

  // Submit idea mutation
  const submitIdeaMutation = useMutation({
    mutationFn: (data: { title: string; description: string }) =>
      apiClient.post(`/api/consultations/${pollId}/ideas`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultation', pollId, 'ideas'] });
      setIdeaTitle('');
      setIdeaDescription('');
      setShowIdeaForm(false);
    },
  });

  // Vote on idea mutation
  const voteIdeaMutation = useMutation({
    mutationFn: ({ ideaId, voteType }: { ideaId: string; voteType: 'upvote' | 'downvote' }) =>
      apiClient.post(`/api/consultations/${pollId}/ideas/${ideaId}/vote`, { voteType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultation', pollId, 'ideas'] });
    },
  });

  // Transition stage mutation
  const transitionStageMutation = useMutation({
    mutationFn: (nextStage: 'shortlist_selection' | 'final_arbitration') =>
      apiClient.post(`/api/consultations/${pollId}/transition`, { nextStage }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultation', pollId] });
    },
  });

  if (!poll || !stageInfo) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <p className="text-center">Loading...</p>
        </div>
      </div>
    );
  }

  const currentStage = stageInfo.currentStage;
  const ideas = ideasResponse?.data || [];
  const isAdmin = user?.role === 'elected_official' || user?.role === 'administration';

  const handleSubmitIdea = (e: React.FormEvent) => {
    e.preventDefault();
    if (ideaTitle.trim() && ideaDescription.trim()) {
      submitIdeaMutation.mutate({ title: ideaTitle, description: ideaDescription });
    }
  };

  const handleVoteIdea = (ideaId: string, voteType: 'upvote' | 'downvote') => {
    voteIdeaMutation.mutate({ ideaId, voteType });
  };

  const handleTransitionStage = () => {
    if (currentStage === 'idea_collection') {
      transitionStageMutation.mutate('shortlist_selection');
    } else if (currentStage === 'shortlist_selection') {
      transitionStageMutation.mutate('final_arbitration');
    }
  };

  const getStageLabel = (stage: string) => {
    switch (stage) {
      case 'idea_collection':
        return '📝 Stage 1: Idea Collection';
      case 'shortlist_selection':
        return '📊 Stage 2: Shortlist Selection';
      case 'final_arbitration':
        return '🗳️ Stage 3: Final Vote';
      default:
        return stage;
    }
  };

  const getStageDescription = (stage: string) => {
    switch (stage) {
      case 'idea_collection':
        return 'Submit your ideas and vote on others. Top ideas will be shortlisted.';
      case 'shortlist_selection':
        return 'Vote on shortlisted ideas. Most popular will go to final vote.';
      case 'final_arbitration':
        return 'Final vote on the best ideas. Results will determine the outcome.';
      default:
        return '';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
            <button onClick={() => router.push('/polls')} className="hover:text-primary-600">
              Polls
            </button>
            <span>/</span>
            <span>Multi-Stage Consultation</span>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-2">{poll.title}</h1>
          {poll.description && (
            <p className="text-gray-600 text-lg mb-4">{poll.description}</p>
          )}

          {/* Current Stage Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-100 text-primary-700 rounded-lg font-semibold">
            {getStageLabel(currentStage)}
          </div>
          <p className="text-gray-600 mt-2">{getStageDescription(currentStage)}</p>
        </div>

        {/* Stage 1 & 2: Ideas */}
        {(currentStage === 'idea_collection' || currentStage === 'shortlist_selection') && (
          <div className="space-y-6">
            {/* Submit Idea Form (Stage 1 only) */}
            {currentStage === 'idea_collection' && user && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                {!showIdeaForm ? (
                  <button
                    onClick={() => setShowIdeaForm(true)}
                    className="w-full px-6 py-3 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition"
                  >
                    ✨ Submit Your Idea
                  </button>
                ) : (
                  <form onSubmit={handleSubmitIdea} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Idea Title *
                      </label>
                      <input
                        type="text"
                        value={ideaTitle}
                        onChange={(e) => setIdeaTitle(e.target.value)}
                        maxLength={500}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        placeholder="Brief title for your idea..."
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Description *
                      </label>
                      <textarea
                        value={ideaDescription}
                        onChange={(e) => setIdeaDescription(e.target.value)}
                        rows={4}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        placeholder="Describe your idea in detail..."
                        required
                      />
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="submit"
                        disabled={submitIdeaMutation.isPending}
                        className="px-6 py-2 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition disabled:opacity-50"
                      >
                        {submitIdeaMutation.isPending ? 'Submitting...' : 'Submit Idea'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowIdeaForm(false)}
                        className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Sort Options */}
            <div className="flex items-center gap-4 bg-white rounded-lg shadow-sm p-4">
              <span className="text-gray-700 font-medium">Sort by:</span>
              <button
                onClick={() => setSortBy('score')}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  sortBy === 'score'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                🏆 Top Voted
              </button>
              <button
                onClick={() => setSortBy('newest')}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  sortBy === 'newest'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                🆕 Newest
              </button>
            </div>

            {/* Ideas List */}
            <div className="space-y-4">
              {ideas.length === 0 ? (
                <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
                  No ideas submitted yet. Be the first!
                </div>
              ) : (
                ideas.map((idea) => (
                  <div
                    key={idea.id}
                    className={`bg-white rounded-lg shadow-sm p-6 ${
                      idea.status === 'shortlisted'
                        ? 'border-2 border-green-400'
                        : idea.status === 'rejected'
                        ? 'opacity-50'
                        : ''
                    }`}
                  >
                    {/* Status Badge */}
                    {idea.status !== 'submitted' && (
                      <div className="mb-3">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                            idea.status === 'shortlisted'
                              ? 'bg-green-100 text-green-800'
                              : idea.status === 'winner'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {idea.status === 'shortlisted' && '✅ Shortlisted'}
                          {idea.status === 'winner' && '🏆 Winner'}
                          {idea.status === 'rejected' && '❌ Not Shortlisted'}
                        </span>
                      </div>
                    )}

                    <h3 className="text-xl font-bold text-gray-900 mb-2">{idea.title}</h3>
                    <p className="text-gray-600 mb-4">{idea.description}</p>

                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-500">
                        by <span className="font-medium">{idea.submitter.displayName}</span>
                      </div>

                      {/* Voting Buttons */}
                      {user && currentStage !== 'final_arbitration' && idea.status !== 'rejected' && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleVoteIdea(idea.id, 'upvote')}
                            disabled={voteIdeaMutation.isPending}
                            className={`flex items-center gap-1 px-3 py-1 rounded-lg font-medium transition ${
                              idea.userVote === 'upvote'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            ▲ {idea.upvotes}
                          </button>

                          <span className="text-lg font-bold text-gray-900">
                            {idea.score >= 0 ? '+' : ''}
                            {idea.score}
                          </span>

                          <button
                            onClick={() => handleVoteIdea(idea.id, 'downvote')}
                            disabled={voteIdeaMutation.isPending}
                            className={`flex items-center gap-1 px-3 py-1 rounded-lg font-medium transition ${
                              idea.userVote === 'downvote'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            ▼ {idea.downvotes}
                          </button>
                        </div>
                      )}

                      {/* Score Display (no voting) */}
                      {!user && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600">
                            Score: <span className="font-bold text-gray-900">{idea.score}</span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Admin: Transition Button */}
            {isAdmin && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-2">🔐 Admin Controls</h3>
                <p className="text-gray-600 mb-4">
                  {currentStage === 'idea_collection'
                    ? `Ready to move to Stage 2? Top ${stageInfo.shortlistSize} ideas will be shortlisted.`
                    : 'Ready to move to Stage 3? Shortlisted ideas will become final poll options.'}
                </p>
                <button
                  onClick={handleTransitionStage}
                  disabled={transitionStageMutation.isPending}
                  className="px-6 py-3 bg-yellow-600 text-white rounded-lg font-semibold hover:bg-yellow-700 transition disabled:opacity-50"
                >
                  {transitionStageMutation.isPending
                    ? 'Processing...'
                    : currentStage === 'idea_collection'
                    ? '➡️ Move to Stage 2: Shortlist Selection'
                    : '➡️ Move to Stage 3: Final Vote'}
                </button>
                {transitionStageMutation.isError && (
                  <p className="mt-2 text-red-600 text-sm">
                    Error: {(transitionStageMutation.error as any)?.message || 'Failed to transition'}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Stage 3: Final Vote */}
        {currentStage === 'final_arbitration' && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <p className="text-center text-gray-600 mb-4">
              Stage 3 uses the standard voting interface. Redirecting...
            </p>
            <div className="text-center">
              <button
                onClick={() => router.push(`/polls/${pollId}`)}
                className="px-6 py-3 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition"
              >
                Go to Final Vote
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
