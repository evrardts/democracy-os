'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { Poll, CreatePollRequest, PollType } from '@democracy-os/shared';

interface PollOption {
  id: string;
  text: string;
}

export default function CreatePollPage() {
  const router = useRouter();
  const { user, tenantSlug } = useAuthStore();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pollType, setPollType] = useState<'quick_poll' | 'multi_stage'>('quick_poll');
  const [options, setOptions] = useState<PollOption[]>([
    { id: '1', text: '' },
    { id: '2', text: '' },
  ]);
  const [tags, setTags] = useState('');
  const [status, setStatus] = useState<'draft' | 'active'>('draft');

  // Multi-stage specific fields
  const [stage1Start, setStage1Start] = useState('');
  const [stage1End, setStage1End] = useState('');
  const [stage2Start, setStage2Start] = useState('');
  const [stage2End, setStage2End] = useState('');
  const [stage3Start, setStage3Start] = useState('');
  const [stage3End, setStage3End] = useState('');
  const [minIdeas, setMinIdeas] = useState('10');
  const [shortlistSize, setShortlistSize] = useState('5');

  apiClient.setTenant(tenantSlug);

  const createMutation = useMutation({
    mutationFn: (data: CreatePollRequest) => apiClient.post<Poll>('/api/polls', data),
    onSuccess: (poll) => {
      if (status === 'active') {
        // Publish immediately
        apiClient.put(`/api/polls/${poll.id}`, { status: 'active' }).then(() => {
          router.push(`/polls/${poll.id}`);
        });
      } else {
        router.push('/polls');
      }
    },
  });

  const addOption = () => {
    setOptions([...options, { id: Date.now().toString(), text: '' }]);
  };

  const removeOption = (id: string) => {
    if (options.length > 2) {
      setOptions(options.filter((opt) => opt.id !== id));
    }
  };

  const updateOption = (id: string, text: string) => {
    setOptions(options.map((opt) => (opt.id === id ? { ...opt, text } : opt)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const tagsArray = tags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t !== '');

    if (pollType === 'quick_poll') {
      const filteredOptions = options.filter((opt) => opt.text.trim() !== '');

      if (filteredOptions.length < 2) {
        alert('Please provide at least 2 options');
        return;
      }

      const data: CreatePollRequest = {
        title,
        description: description || undefined,
        pollType: PollType.QUICK_POLL,
        options: filteredOptions.map((opt) => ({ text: opt.text })),
        tags: tagsArray.length > 0 ? tagsArray : undefined,
      };

      createMutation.mutate(data);
    } else {
      // Multi-stage consultation
      if (!stage1Start || !stage1End || !stage2Start || !stage2End || !stage3Start || !stage3End) {
        alert('Please provide all stage dates');
        return;
      }

      // Create poll
      const pollData: CreatePollRequest = {
        title,
        description: description || undefined,
        pollType: PollType.MULTI_STAGE,
        options: [], // Options will be generated in stage 3
        tags: tagsArray.length > 0 ? tagsArray : undefined,
      };

      try {
        const poll = await apiClient.post<Poll>('/api/polls', pollData);

        // Create consultation stage info via database insert
        // Note: In production, this should be a dedicated API endpoint
        const stageData = {
          pollId: poll.id,
          stage1Start: new Date(stage1Start),
          stage1End: new Date(stage1End),
          stage2Start: new Date(stage2Start),
          stage2End: new Date(stage2End),
          stage3Start: new Date(stage3Start),
          stage3End: new Date(stage3End),
          minIdeasForStage2: parseInt(minIdeas),
          shortlistSize: parseInt(shortlistSize),
        };

        // Direct database insert using API client
        await apiClient.post('/api/consultations/create-stages', stageData);

        router.push(`/consultations/${poll.id}`);
      } catch (error) {
        alert('Failed to create multi-stage consultation');
        console.error(error);
      }
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-700 mb-4">Please login to create polls</p>
          <Link href="/login" className="px-4 py-2 bg-primary-600 text-white rounded-lg">
            Login
          </Link>
        </div>
      </div>
    );
  }

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
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Create New Poll</h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                Poll Title *
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                minLength={5}
                maxLength={500}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="What question do you want to ask?"
              />
              <p className="text-sm text-gray-500 mt-1">
                {title.length}/500 characters
              </p>
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                Description (optional)
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Provide more context about this poll..."
              />
            </div>

            {/* Poll Type Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Poll Type *
              </label>
              <div className="space-y-3">
                <label className="flex items-start gap-3 p-4 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="pollType"
                    value="quick_poll"
                    checked={pollType === 'quick_poll'}
                    onChange={(e) => setPollType(e.target.value as 'quick_poll')}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-medium text-gray-900">Quick Poll</div>
                    <div className="text-sm text-gray-600">
                      Simple single-question poll with predefined options. Results visible immediately after voting.
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-4 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="pollType"
                    value="multi_stage"
                    checked={pollType === 'multi_stage'}
                    onChange={(e) => setPollType(e.target.value as 'multi_stage')}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-medium text-gray-900">Multi-Stage Consultation</div>
                    <div className="text-sm text-gray-600">
                      Complex 3-stage process: (1) Citizens submit ideas, (2) Vote on shortlist, (3) Final decision vote.
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* Quick Poll Options */}
            {pollType === 'quick_poll' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Poll Options * (minimum 2)
                </label>
              <div className="space-y-3">
                {options.map((option, index) => (
                  <div key={option.id} className="flex gap-2">
                    <span className="flex items-center justify-center w-8 h-10 text-gray-500 font-medium">
                      {index + 1}.
                    </span>
                    <input
                      type="text"
                      value={option.text}
                      onChange={(e) => updateOption(option.id, e.target.value)}
                      required
                      maxLength={200}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder={`Option ${index + 1}`}
                    />
                    {options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeOption(option.id)}
                        className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addOption}
                className="mt-3 px-4 py-2 text-primary-600 border border-primary-600 rounded-lg hover:bg-primary-50 transition"
              >
                + Add Option
              </button>
              </div>
            )}

            {/* Multi-Stage Consultation Configuration */}
            {pollType === 'multi_stage' && (
              <div className="space-y-6 p-6 bg-blue-50 rounded-lg border border-blue-200">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    📅 Configure Stages Timeline
                  </h3>

                  {/* Stage 1 */}
                  <div className="mb-6">
                    <h4 className="font-medium text-gray-900 mb-2">Stage 1: Idea Collection</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Start Date *</label>
                        <input
                          type="datetime-local"
                          value={stage1Start}
                          onChange={(e) => setStage1Start(e.target.value)}
                          required={pollType === 'multi_stage'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">End Date *</label>
                        <input
                          type="datetime-local"
                          value={stage1End}
                          onChange={(e) => setStage1End(e.target.value)}
                          required={pollType === 'multi_stage'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Stage 2 */}
                  <div className="mb-6">
                    <h4 className="font-medium text-gray-900 mb-2">Stage 2: Shortlist Selection</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Start Date *</label>
                        <input
                          type="datetime-local"
                          value={stage2Start}
                          onChange={(e) => setStage2Start(e.target.value)}
                          required={pollType === 'multi_stage'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">End Date *</label>
                        <input
                          type="datetime-local"
                          value={stage2End}
                          onChange={(e) => setStage2End(e.target.value)}
                          required={pollType === 'multi_stage'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Stage 3 */}
                  <div className="mb-6">
                    <h4 className="font-medium text-gray-900 mb-2">Stage 3: Final Vote</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Start Date *</label>
                        <input
                          type="datetime-local"
                          value={stage3Start}
                          onChange={(e) => setStage3Start(e.target.value)}
                          required={pollType === 'multi_stage'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">End Date *</label>
                        <input
                          type="datetime-local"
                          value={stage3End}
                          onChange={(e) => setStage3End(e.target.value)}
                          required={pollType === 'multi_stage'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Configuration */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-700 mb-1">
                        Minimum Ideas for Stage 2
                      </label>
                      <input
                        type="number"
                        value={minIdeas}
                        onChange={(e) => setMinIdeas(e.target.value)}
                        min="1"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <p className="text-xs text-gray-600 mt-1">
                        Minimum ideas required to proceed to shortlisting
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700 mb-1">
                        Shortlist Size
                      </label>
                      <input
                        type="number"
                        value={shortlistSize}
                        onChange={(e) => setShortlistSize(e.target.value)}
                        min="1"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <p className="text-xs text-gray-600 mt-1">
                        Number of top ideas to shortlist for final vote
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="tags" className="block text-sm font-medium text-gray-700 mb-2">
                Tags (optional)
              </label>
              <input
                id="tags"
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Comma-separated tags (e.g., transport, environment, budget)"
              />
              <p className="text-sm text-gray-500 mt-1">
                Separate tags with commas
              </p>
            </div>

            {createMutation.error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {createMutation.error instanceof Error
                  ? createMutation.error.message
                  : 'Failed to create poll'}
              </div>
            )}

            <div className="flex gap-4 pt-4">
              <button
                type="submit"
                onClick={() => setStatus('draft')}
                disabled={createMutation.isPending}
                className="flex-1 bg-gray-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {createMutation.isPending ? 'Saving...' : 'Save as Draft'}
              </button>
              <button
                type="submit"
                onClick={() => setStatus('active')}
                disabled={createMutation.isPending}
                className="flex-1 bg-primary-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {createMutation.isPending ? 'Publishing...' : 'Publish Now'}
              </button>
            </div>
          </form>
        </div>

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">Tips for creating effective polls:</h3>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>Keep your question clear and concise</li>
            <li>Provide balanced and distinct options</li>
            <li>Add context in the description to help voters decide</li>
            <li>Use tags to help people discover your poll</li>
            <li>Save as draft first to review before publishing</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
