'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { CommentWithAuthor, CreateCommentRequest, VoteType, ReportReason } from '@democracy-os/shared';
import CommentItem from './CommentItem';
import CommentForm from './CommentForm';

interface CommentSectionProps {
  pollId: string;
}

export default function CommentSection({ pollId }: CommentSectionProps) {
  const { user, tenantSlug } = useAuthStore();
  const queryClient = useQueryClient();
  const [sortBy, setSortBy] = useState<'best' | 'newest' | 'controversial'>('best');
  const [showForm, setShowForm] = useState(false);

  apiClient.setTenant(tenantSlug);

  const { data: comments, isLoading } = useQuery<CommentWithAuthor[]>({
    queryKey: ['comments', pollId, sortBy],
    queryFn: () => apiClient.get(`/api/polls/${pollId}/comments`, { sort: sortBy }),
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateCommentRequest) =>
      apiClient.post(`/api/polls/${pollId}/comments`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', pollId] });
      setShowForm(false);
    },
  });

  const voteMutation = useMutation({
    mutationFn: ({ commentId, voteType }: { commentId: string; voteType: VoteType }) =>
      apiClient.post(`/api/comments/${commentId}/vote`, { voteType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', pollId] });
    },
  });

  const reportMutation = useMutation({
    mutationFn: ({ commentId, reason }: { commentId: string; reason: ReportReason }) =>
      apiClient.post(`/api/comments/${commentId}/report`, { reason }),
    onSuccess: () => {
      alert('Comment reported. Thank you for helping keep our community safe.');
    },
  });

  const handleSubmit = (content: string) => {
    createMutation.mutate({ content });
  };

  const handleVote = (commentId: string, voteType: VoteType) => {
    if (!user) {
      alert('Please login to vote on comments');
      return;
    }
    voteMutation.mutate({ commentId, voteType });
  };

  const handleReport = (commentId: string, reason: ReportReason) => {
    if (!user) {
      alert('Please login to report comments');
      return;
    }
    reportMutation.mutate({ commentId, reason });
  };

  return (
    <div className="mt-8 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">
          Discussion ({comments?.length || 0})
        </h2>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        >
          <option value="best">Best</option>
          <option value="newest">Newest</option>
          <option value="controversial">Controversial</option>
        </select>
      </div>

      {user && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-primary-500 hover:text-primary-600 transition"
        >
          + Add a comment
        </button>
      )}

      {user && showForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <CommentForm
            onSubmit={handleSubmit}
            onCancel={() => setShowForm(false)}
            isSubmitting={createMutation.isPending}
            error={
              createMutation.error instanceof Error
                ? createMutation.error.message
                : undefined
            }
          />
        </div>
      )}

      {!user && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
          <p className="text-blue-900">
            Please{' '}
            <a href="/login" className="font-semibold underline">
              login
            </a>{' '}
            to join the discussion
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading comments...</p>
        </div>
      ) : comments && comments.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>No comments yet. Be the first to share your thoughts!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {comments?.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUserId={user?.id}
              onVote={handleVote}
              onReport={handleReport}
            />
          ))}
        </div>
      )}
    </div>
  );
}
