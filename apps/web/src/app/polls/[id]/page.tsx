'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { Poll, PollResults, VoteResponse } from '@democracy-os/shared';
import CommentSection from '@/components/CommentSection';

export default function PollDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const pollId = params.id as string;
  const { user, tenantSlug } = useAuthStore();
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  apiClient.setTenant(tenantSlug);

  const { data: poll, isLoading: pollLoading } = useQuery<Poll>({
    queryKey: ['poll', pollId],
    queryFn: () => apiClient.get(`/api/polls/${pollId}`),
  });

  const { data: hasVoted, isLoading: hasVotedLoading } = useQuery<{ hasVoted: boolean; vote?: any }>({
    queryKey: ['hasVoted', pollId],
    queryFn: () => apiClient.get(`/api/polls/${pollId}/has-voted`),
    enabled: !!user,
  });

  const { data: results } = useQuery<PollResults>({
    queryKey: ['pollResults', pollId],
    queryFn: () => apiClient.get(`/api/polls/${pollId}/results`),
    enabled: !!user && hasVoted?.hasVoted,
    retry: false,
  });

  const voteMutation = useMutation({
    mutationFn: (optionId: string) =>
      apiClient.post<VoteResponse>(`/api/polls/${pollId}/vote`, { optionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hasVoted', pollId] });
      queryClient.invalidateQueries({ queryKey: ['pollResults', pollId] });
    },
  });

  const handleVote = () => {
    if (!selectedOption) return;
    voteMutation.mutate(selectedOption);
  };

  if (pollLoading || hasVotedLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading poll...</p>
        </div>
      </div>
    );
  }

  if (!poll) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">Poll not found</p>
          <Link href="/polls" className="mt-4 text-primary-600 hover:text-primary-700">
            Back to polls
          </Link>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-700 mb-4">Please login to vote</p>
          <Link href="/login" className="px-4 py-2 bg-primary-600 text-white rounded-lg">
            Login
          </Link>
        </div>
      </div>
    );
  }

  const userVote = hasVoted?.vote?.optionId;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <Link href="/polls" className="text-primary-600 hover:text-primary-700">
            ← Back to polls
          </Link>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="bg-white rounded-xl shadow-sm p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">{poll.title}</h1>
          {poll.description && (
            <p className="text-gray-600 mb-6">{poll.description}</p>
          )}

          {poll.tags && poll.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {poll.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 bg-primary-100 text-primary-700 text-sm rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {!hasVoted?.hasVoted ? (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Cast your vote</h2>
              {poll.options.map((option) => (
                <label
                  key={option.id}
                  className={`block p-4 border-2 rounded-lg cursor-pointer transition ${
                    selectedOption === option.id
                      ? 'border-primary-600 bg-primary-50'
                      : 'border-gray-200 hover:border-primary-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="vote"
                    value={option.id}
                    checked={selectedOption === option.id}
                    onChange={() => setSelectedOption(option.id)}
                    className="mr-3"
                  />
                  <span className="font-medium">{option.text}</span>
                </label>
              ))}

              {voteMutation.error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                  {voteMutation.error instanceof Error ? voteMutation.error.message : 'Failed to submit vote'}
                </div>
              )}

              <button
                onClick={handleVote}
                disabled={!selectedOption || voteMutation.isPending}
                className="w-full mt-6 bg-primary-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {voteMutation.isPending ? 'Submitting...' : 'Submit Vote'}
              </button>
            </div>
          ) : (
            <div>
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
                ✓ You have voted! You can update your vote below or view the results.
              </div>

              {results && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">Results</h2>
                    <span className="text-gray-600">{results.totalVotes} total votes</span>
                  </div>

                  {results.results.map((result) => {
                    const isUserVote = result.optionId === userVote;
                    return (
                      <div key={result.optionId} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className={`font-medium ${isUserVote ? 'text-primary-600' : 'text-gray-700'}`}>
                            {result.optionText} {isUserVote && '(Your vote)'}
                          </span>
                          <span className="text-gray-600 font-semibold">
                            {result.percentage}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3">
                          <div
                            className={`h-3 rounded-full transition-all ${
                              isUserVote ? 'bg-primary-600' : 'bg-gray-400'
                            }`}
                            style={{ width: `${result.percentage}%` }}
                          />
                        </div>
                        <div className="text-sm text-gray-500">
                          {result.count} {result.count === 1 ? 'vote' : 'votes'}
                        </div>
                      </div>
                    );
                  })}

                  <div className="mt-6 pt-6 border-t">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Update your vote</h3>
                    <div className="space-y-2">
                      {poll.options.map((option) => (
                        <label
                          key={option.id}
                          className={`block p-3 border-2 rounded-lg cursor-pointer transition ${
                            selectedOption === option.id || (!selectedOption && option.id === userVote)
                              ? 'border-primary-600 bg-primary-50'
                              : 'border-gray-200 hover:border-primary-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="update-vote"
                            value={option.id}
                            checked={selectedOption ? selectedOption === option.id : option.id === userVote}
                            onChange={() => setSelectedOption(option.id)}
                            className="mr-3"
                          />
                          <span className="text-sm">{option.text}</span>
                        </label>
                      ))}
                      {selectedOption && selectedOption !== userVote && (
                        <button
                          onClick={handleVote}
                          disabled={voteMutation.isPending}
                          className="w-full mt-3 bg-primary-600 text-white py-2 px-4 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition"
                        >
                          {voteMutation.isPending ? 'Updating...' : 'Update Vote'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Comments Section */}
        <CommentSection pollId={pollId} />
      </main>
    </div>
  );
}
