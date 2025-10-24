import 'package:bluebubbles/helpers/helpers.dart';
import 'package:bluebubbles/services/services.dart';
import 'package:bluebubbles/database/models.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

/// Member Sidebar Widget
/// Shows CRM member data alongside BlueBubbles conversations
/// Links BlueBubbles chats (ObjectBox) with Supabase member data
class MemberSidebar extends StatefulWidget {
  final Chat chat;

  const MemberSidebar({
    Key? key,
    required this.chat,
  }) : super(key: key);

  @override
  State<MemberSidebar> createState() => _MemberSidebarState();
}

class _MemberSidebarState extends State<MemberSidebar> {
  Member? member;
  List<Tag> memberTags = [];
  bool isLoading = true;
  String? errorMessage;

  @override
  void initState() {
    super.initState();
    _loadMemberData();
  }

  @override
  void didUpdateWidget(MemberSidebar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.chat.guid != widget.chat.guid) {
      _loadMemberData();
    }
  }

  Future<void> _loadMemberData() async {
    setState(() {
      isLoading = true;
      errorMessage = null;
    });

    try {
      // Get phone number from chat participants
      final participants = widget.chat.participants;
      if (participants.isEmpty) {
        setState(() {
          isLoading = false;
          errorMessage = "No participants in this chat";
        });
        return;
      }

      // Get first participant's phone number
      String phoneNumber = participants.first.address ?? '';

      if (phoneNumber.isEmpty) {
        setState(() {
          isLoading = false;
          errorMessage = "No phone number found";
        });
        return;
      }

      // Query Supabase for member data
      final fetchedMember = await supabaseCrm.getMemberByPhone(phoneNumber);

      if (fetchedMember == null) {
        setState(() {
          isLoading = false;
          member = null;
          errorMessage = "Member not found in CRM";
        });
        return;
      }

      // Load tags for this member
      final tags = await supabaseCrm.getTagsForMember(fetchedMember.id);

      setState(() {
        member = fetchedMember;
        memberTags = tags;
        isLoading = false;
      });
    } catch (e) {
      setState(() {
        isLoading = false;
        errorMessage = "Error loading member: ${e.toString()}";
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 300,
      decoration: BoxDecoration(
        color: context.theme.colorScheme.surface,
        border: Border(
          left: BorderSide(
            color: context.theme.colorScheme.outline.withOpacity(0.2),
            width: 1,
          ),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              border: Border(
                bottom: BorderSide(
                  color: context.theme.colorScheme.outline.withOpacity(0.2),
                  width: 1,
                ),
              ),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.person,
                  color: context.theme.colorScheme.primary,
                ),
                const SizedBox(width: 8),
                Text(
                  'Member Info',
                  style: context.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),

          // Content
          Expanded(
            child: _buildContent(),
          ),
        ],
      ),
    );
  }

  Widget _buildContent() {
    if (isLoading) {
      return const Center(
        child: CircularProgressIndicator(),
      );
    }

    if (errorMessage != null) {
      return _buildErrorState();
    }

    if (member == null) {
      return _buildNoMemberState();
    }

    return _buildMemberDetails();
  }

  Widget _buildErrorState() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.error_outline,
            size: 48,
            color: context.theme.colorScheme.error,
          ),
          const SizedBox(height: 16),
          Text(
            errorMessage ?? 'Unknown error',
            style: context.textTheme.bodyMedium,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          ElevatedButton.icon(
            onPressed: _loadMemberData,
            icon: const Icon(Icons.refresh),
            label: const Text('Retry'),
          ),
        ],
      ),
    );
  }

  Widget _buildNoMemberState() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.person_off_outlined,
            size: 48,
            color: context.theme.colorScheme.onSurface.withOpacity(0.5),
          ),
          const SizedBox(height: 16),
          Text(
            'Not a CRM Member',
            style: context.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.bold,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            'This contact is not in your member database.',
            style: context.textTheme.bodyMedium?.copyWith(
              color: context.theme.colorScheme.onSurface.withOpacity(0.7),
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: () {
              // TODO: Open dialog to add member
              showDialog(
                context: context,
                builder: (context) => AlertDialog(
                  title: const Text('Add Member'),
                  content: const Text('Member creation dialog coming soon!'),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('OK'),
                    ),
                  ],
                ),
              );
            },
            icon: const Icon(Icons.person_add),
            label: const Text('Add to CRM'),
          ),
        ],
      ),
    );
  }

  Widget _buildMemberDetails() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Member Name
          Text(
            member!.name,
            style: context.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 4),

          // Phone Number
          Row(
            children: [
              Icon(
                Icons.phone,
                size: 16,
                color: context.theme.colorScheme.onSurface.withOpacity(0.6),
              ),
              const SizedBox(width: 4),
              Text(
                member!.phone,
                style: context.textTheme.bodyMedium?.copyWith(
                  color: context.theme.colorScheme.onSurface.withOpacity(0.8),
                ),
              ),
            ],
          ),

          // Email (if available)
          if (member!.email != null) ...[
            const SizedBox(height: 4),
            Row(
              children: [
                Icon(
                  Icons.email,
                  size: 16,
                  color: context.theme.colorScheme.onSurface.withOpacity(0.6),
                ),
                const SizedBox(width: 4),
                Flexible(
                  child: Text(
                    member!.email!,
                    style: context.textTheme.bodyMedium?.copyWith(
                      color: context.theme.colorScheme.onSurface.withOpacity(0.8),
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ],

          const SizedBox(height: 24),

          // Demographics Section
          _buildSection(
            'Demographics',
            [
              if (member!.county != null)
                _buildInfoRow('County', member!.county!),
              if (member!.district != null)
                _buildInfoRow('District', member!.district!),
              if (member!.gender != null)
                _buildInfoRow('Gender', member!.gender!),
              if (member!.age != null)
                _buildInfoRow('Age', '${member!.age}'),
              if (member!.race != null)
                _buildInfoRow('Race', member!.race!),
            ],
          ),

          const SizedBox(height: 16),

          // Tags Section
          _buildSection(
            'Tags',
            [
              if (memberTags.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Text(
                    'No tags',
                    style: context.textTheme.bodySmall?.copyWith(
                      color: context.theme.colorScheme.onSurface.withOpacity(0.5),
                      fontStyle: FontStyle.italic,
                    ),
                  ),
                )
              else
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: memberTags.map((tag) => _buildTagChip(tag)).toList(),
                ),
            ],
          ),

          const SizedBox(height: 16),

          // Committees Section
          if (member!.committees != null && member!.committees!.isNotEmpty)
            _buildSection(
              'Committees',
              [
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: member!.committees!
                      .map((committee) => Chip(
                            label: Text(
                              committee,
                              style: context.textTheme.bodySmall,
                            ),
                            backgroundColor: context.theme.colorScheme.primaryContainer,
                          ))
                      .toList(),
                ),
              ],
            ),

          const SizedBox(height: 24),

          // Quick Actions
          _buildSection(
            'Quick Actions',
            [
              _buildActionButton(
                icon: Icons.email,
                label: 'Send Intro',
                onTap: () {
                  // TODO: Implement send intro
                  showDialog(
                    context: context,
                    builder: (context) => AlertDialog(
                      title: const Text('Send Intro'),
                      content: const Text('Send intro message functionality coming soon!'),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(context),
                          child: const Text('OK'),
                        ),
                      ],
                    ),
                  );
                },
              ),
              const SizedBox(height: 8),
              _buildActionButton(
                icon: Icons.label,
                label: 'Manage Tags',
                onTap: () {
                  _showTagManagementDialog();
                },
              ),
              const SizedBox(height: 8),
              _buildActionButton(
                icon: Icons.edit,
                label: 'Edit Member',
                onTap: () {
                  // TODO: Implement edit member
                  showDialog(
                    context: context,
                    builder: (context) => AlertDialog(
                      title: const Text('Edit Member'),
                      content: const Text('Edit member functionality coming soon!'),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(context),
                          child: const Text('OK'),
                        ),
                      ],
                    ),
                  );
                },
              ),
              const SizedBox(height: 8),
              _buildActionButton(
                icon: Icons.open_in_new,
                label: 'View Full Profile',
                onTap: () {
                  // TODO: Navigate to full member profile page
                  showDialog(
                    context: context,
                    builder: (context) => AlertDialog(
                      title: const Text('Member Profile'),
                      content: const Text('Full profile page coming soon!'),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(context),
                          child: const Text('OK'),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ],
          ),

          // Opted Out Warning
          if (member!.optedOut) ...[
            const SizedBox(height: 24),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: context.theme.colorScheme.errorContainer,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.warning_amber_rounded,
                    color: context.theme.colorScheme.error,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'This member has opted out',
                      style: context.textTheme.bodyMedium?.copyWith(
                        color: context.theme.colorScheme.error,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildSection(String title, List<Widget> children) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: context.textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.bold,
            color: context.theme.colorScheme.primary,
          ),
        ),
        const SizedBox(height: 8),
        ...children,
      ],
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 80,
            child: Text(
              '$label:',
              style: context.textTheme.bodySmall?.copyWith(
                color: context.theme.colorScheme.onSurface.withOpacity(0.6),
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: context.textTheme.bodyMedium,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTagChip(Tag tag) {
    Color tagColor;
    try {
      tagColor = Color(int.parse(tag.color.replaceAll('#', '0xFF')));
    } catch (e) {
      tagColor = context.theme.colorScheme.primary;
    }

    return Chip(
      label: Text(
        tag.name,
        style: context.textTheme.bodySmall?.copyWith(
          color: Colors.white,
        ),
      ),
      backgroundColor: tagColor,
      deleteIcon: const Icon(Icons.close, size: 16, color: Colors.white),
      onDeleted: () {
        _removeTag(tag);
      },
    );
  }

  Widget _buildActionButton({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
        decoration: BoxDecoration(
          border: Border.all(
            color: context.theme.colorScheme.outline.withOpacity(0.3),
          ),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          children: [
            Icon(icon, size: 20),
            const SizedBox(width: 12),
            Text(label, style: context.textTheme.bodyMedium),
          ],
        ),
      ),
    );
  }

  void _showTagManagementDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Manage Tags'),
        content: SizedBox(
          width: 400,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Tag management coming soon!'),
              const SizedBox(height: 16),
              // TODO: Show available tags and allow adding/removing
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  Future<void> _removeTag(Tag tag) async {
    if (member == null) return;

    final success = await supabaseCrm.removeTagFromMember(member!.id, tag.id);

    if (success) {
      setState(() {
        memberTags.removeWhere((t) => t.id == tag.id);
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Removed tag: ${tag.name}')),
        );
      }
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to remove tag')),
        );
      }
    }
  }
}
