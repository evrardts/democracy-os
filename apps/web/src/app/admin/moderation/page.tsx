'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { UserRole } from '@democracy-os/shared';
import Navigation from '@/components/Navigation';

interface ReportedComment {
  id: string;
  pollId: string;
  pollTitle: string;
  content: string;
  authorName: string;
  reportCount: number;
  reportReasons: string[];
  createdAt: string;
  isHidden: boolean;
}

export default function ModerationDashboardPage() {
  const queryClient = useQueryClient();
  const { user, tenantSlug } = useAuthStore();
  const [filter, setFilter] = useState<'all' | 'pending' | 'hidden'>('pending');

  apiClient.setTenant(tenantSlug);

  const { data: reportedComments, isLoading } = useQuery<ReportedComment[]>({
    queryKey: ['reported-comments', tenantSlug, filter],
    queryFn: () => apiClient.get(`/api/moderation/comments?status=${filter}`),
    enabled: !!user,
  });

  const hideCommentMutation = useMutation({
    mutationFn: (commentId: string) =>
      apiClient.post(`/api/moderation/comments/${commentId}/hide`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reported-comments'] });
    },
  });

  const dismissReportsMutation = useMutation({
    mutationFn: (commentId: string) =>
      apiClient.post(`/api/moderation/comments/${commentId}/dismiss`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reported-comments'] });
    },
  });

  // Check if user is a moderator
  const canModerate = user && (
    user.role === UserRole.ADMIN ||
    user.role === UserRole.MODERATOR
  );

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
            <p className="text-gray-600 mb-4">Please log in to access moderation.</p>
            <Link href="/login" className="text-primary-600 hover:underline">
              Go to Login
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!canModerate) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
            <p className="text-gray-600 mb-4">
              Only moderators and administrators can access this page.
            </p>
            <Link href="/" className="text-primary-600 hover:underline">
              Back to Home
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const getReasonLabel = (reason: string) => {
    switch (reason) {
      case 'spam':
        return 'Spam';
      case 'hate':
        return 'Hate Speech';
      case 'harassment':
        return 'Harassment';
      case 'off_topic':
        return 'Off Topic';
      default:
        return reason;
    }
  };

  const getReasonColor = (reason: string) => {
    switch (reason) {
      case 'spam':
        return 'bg-yellow-100 text-yellow-800';
      case 'hate':
        return 'bg-red-100 text-red-800';
      case 'harassment':
        return 'bg-red-100 text-red-800';
      case 'off_topic':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Content Moderation</h1>
              <p className="text-gray-600 mt-2">
                Review and manage reported comments
              </p>
            </div>
            <Link
              href="/admin"
              className="text-primary-600 hover:underline"
            >
              &larr; Back to Admin
            </Link>
          </div>

          {/* Filter Tabs */}
          <div className="bg-white rounded-xl shadow-sm mb-6">
            <div className="flex border-b">
              <button
                onClick={() => setFilter('pending')}
                className={`flex-1 py-3 px-4 text-center font-medium transition ${
                  filter === 'pending'
                    ? 'text-primary-600 border-b-2 border-primary-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Pending Review
              </button>
              <button
                onClick={() => setFilter('hidden')}
                className={`flex-1 py-3 px-4 text-center font-medium transition ${
                  filter === 'hidden'
                    ? 'text-primary-600 border-b-2 border-primary-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Hidden
              </button>
              <button
                onClick={() => setFilter('all')}
                className={`flex-1 py-3 px-4 text-center font-medium transition ${
                  filter === 'all'
                    ? 'text-primary-600 border-b-2 border-primary-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                All Reports
              </button>
            </div>
          </div>

          {/* Reported Comments List */}
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading reports...</p>
            </div>
          ) : !reportedComments || reportedComments.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center">
              <div className="text-6xl mb-4">✅</div>
              <p className="text-gray-600 text-lg">No reported comments to review</p>
              <p className="text-gray-500 text-sm mt-2">
                All caught up! Check back later for new reports.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {reportedComments.map((comment) => (
                <div
                  key={comment.id}
                  className={`bg-white rounded-xl shadow-sm p-6 ${
                    comment.isHidden ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <Link
                        href={`/polls/${comment.pollId}`}
                        className="text-primary-600 hover:underline text-sm"
                      >
                        {comment.pollTitle}
                      </Link>
                      <p className="text-sm text-gray-500 mt-1">
                        By {comment.authorName} • {new Date(comment.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-semibold">
                        {comment.reportCount} reports
                      </span>
                      {comment.isHidden && (
                        <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm font-semibold">
                          Hidden
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Comment Content */}
                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <p className="text-gray-800">{comment.content}</p>
                  </div>

                  {/* Report Reasons */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {comment.reportReasons.map((reason, idx) => (
                      <span
                        key={idx}
                        className={`px-2 py-1 rounded text-xs font-medium ${getReasonColor(reason)}`}
                      >
                        {getReasonLabel(reason)}
                      </span>
                    ))}
                  </div>

                  {/* Actions */}
                  {!comment.isHidden && (
                    <div className="flex gap-3">
                      <button
                        onClick={() => hideCommentMutation.mutate(comment.id)}
                        disabled={hideCommentMutation.isPending}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                      >
                        Hide Comment
                      </button>
                      <button
                        onClick={() => dismissReportsMutation.mutate(comment.id)}
                        disabled={dismissReportsMutation.isPending}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
                      >
                        Dismiss Reports
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
