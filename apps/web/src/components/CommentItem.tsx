'use client';

import { useState } from 'react';
import { CommentWithAuthor, VoteType, ReportReason } from '@democracy-os/shared';
import { formatDistanceToNow } from 'date-fns';

interface CommentItemProps {
  comment: CommentWithAuthor;
  currentUserId?: string;
  onVote: (commentId: string, voteType: VoteType) => void;
  onReport: (commentId: string, reason: ReportReason) => void;
}

export default function CommentItem({
  comment,
  currentUserId,
  onVote,
  onReport,
}: CommentItemProps) {
  const [showReportModal, setShowReportModal] = useState(false);
  const [showEditHistory, setShowEditHistory] = useState(false);

  const isAuthor = currentUserId === comment.userId;
  const hasUpvoted = comment.userVote === VoteType.UPVOTE;
  const hasDownvoted = comment.userVote === VoteType.DOWNVOTE;

  const handleVote = (voteType: VoteType) => {
    onVote(comment.id, voteType);
  };

  const handleReport = (reason: ReportReason) => {
    onReport(comment.id, reason);
    setShowReportModal(false);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex gap-3">
        {/* Vote buttons */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={() => handleVote(VoteType.UPVOTE)}
            disabled={!currentUserId}
            className={`p-1 rounded hover:bg-gray-100 transition ${
              hasUpvoted ? 'text-primary-600' : 'text-gray-400'
            } ${!currentUserId ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 3l5 7H5l5-7z" />
            </svg>
          </button>
          <span
            className={`text-sm font-semibold ${
              comment.score > 0
                ? 'text-green-600'
                : comment.score < 0
                ? 'text-red-600'
                : 'text-gray-600'
            }`}
          >
            {comment.score}
          </span>
          <button
            onClick={() => handleVote(VoteType.DOWNVOTE)}
            disabled={!currentUserId}
            className={`p-1 rounded hover:bg-gray-100 transition ${
              hasDownvoted ? 'text-primary-600' : 'text-gray-400'
            } ${!currentUserId ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 17l-5-7h10l-5 7z" />
            </svg>
          </button>
        </div>

        {/* Comment content */}
        <div className="flex-1">
          <div className="flex items-start justify-between mb-2">
            <div>
              <span className="font-semibold text-gray-900">
                {comment.author.displayName}
              </span>
              {isAuthor && (
                <span className="ml-2 px-2 py-0.5 bg-primary-100 text-primary-700 text-xs rounded">
                  You
                </span>
              )}
              <span className="ml-2 text-sm text-gray-500">
                {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
              </span>
              {comment.updatedAt !== comment.createdAt && (
                <button
                  onClick={() => setShowEditHistory(!showEditHistory)}
                  className="ml-2 text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  (edited)
                </button>
              )}
            </div>

            {currentUserId && !isAuthor && (
              <button
                onClick={() => setShowReportModal(true)}
                className="text-sm text-gray-500 hover:text-red-600"
                title="Report comment"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
                  />
                </svg>
              </button>
            )}
          </div>

          <p className="text-gray-700 whitespace-pre-wrap">{comment.content}</p>

          {comment.reportCount > 0 && (
            <div className="mt-2 text-xs text-orange-600">
              ⚠️ This comment has been reported {comment.reportCount} time(s)
            </div>
          )}

          {showEditHistory && comment.editHistory && comment.editHistory.length > 0 && (
            <div className="mt-3 pl-4 border-l-2 border-gray-200">
              <p className="text-sm font-semibold text-gray-700 mb-2">Edit History:</p>
              {comment.editHistory.map((edit, index) => (
                <div key={index} className="text-sm text-gray-600 mb-2">
                  <p className="text-xs text-gray-500 mb-1">
                    {formatDistanceToNow(new Date(edit.editedAt), { addSuffix: true })}
                  </p>
                  <p>{edit.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Report Comment</h3>
            <p className="text-gray-600 mb-4">
              Why are you reporting this comment?
            </p>

            <div className="space-y-2 mb-6">
              <button
                onClick={() => handleReport(ReportReason.SPAM)}
                className="w-full text-left px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                <div className="font-semibold">Spam</div>
                <div className="text-sm text-gray-600">
                  Unwanted commercial content or repetitive posts
                </div>
              </button>

              <button
                onClick={() => handleReport(ReportReason.HATE)}
                className="w-full text-left px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                <div className="font-semibold">Hate Speech</div>
                <div className="text-sm text-gray-600">
                  Discriminatory or hateful language
                </div>
              </button>

              <button
                onClick={() => handleReport(ReportReason.HARASSMENT)}
                className="w-full text-left px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                <div className="font-semibold">Harassment</div>
                <div className="text-sm text-gray-600">
                  Bullying, threats, or personal attacks
                </div>
              </button>

              <button
                onClick={() => handleReport(ReportReason.OFF_TOPIC)}
                className="w-full text-left px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                <div className="font-semibold">Off Topic</div>
                <div className="text-sm text-gray-600">
                  Not relevant to the discussion
                </div>
              </button>
            </div>

            <button
              onClick={() => setShowReportModal(false)}
              className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
