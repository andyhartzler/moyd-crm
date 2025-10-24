import 'dart:async';

import 'package:bluebubbles/utils/logger/logger.dart';
import 'package:flutter/foundation.dart';
import 'package:get/get.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Get an instance of our [SupabaseService]
SupabaseService supabaseCrm = Get.isRegistered<SupabaseService>()
    ? Get.find<SupabaseService>()
    : Get.put(SupabaseService());

/// Service that manages CRM data in Supabase
/// Handles members, tags, analytics, templates, etc.
/// Messages are still stored in ObjectBox (BlueBubbles default)
class SupabaseService extends GetxService {
  late SupabaseClient client;

  final RxBool isInitialized = false.obs;
  final RxString lastError = "".obs;

  // Reactive member cache
  final RxList<Member> members = <Member>[].obs;
  final RxList<Tag> tags = <Tag>[].obs;

  @override
  Future<void> onInit() async {
    super.onInit();
    Logger.debug("Initializing Supabase CRM service...");

    try {
      await _initializeSupabase();
      Logger.debug("Supabase CRM service initialized successfully");
    } catch (e, s) {
      Logger.error("Failed to initialize Supabase CRM service", error: e, trace: s);
      lastError.value = e.toString();
    }
  }

  Future<void> _initializeSupabase() async {
    // Get environment variables
    const supabaseUrl = String.fromEnvironment('SUPABASE_URL', defaultValue: '');
    const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY', defaultValue: '');

    if (supabaseUrl.isEmpty || supabaseAnonKey.isEmpty) {
      throw Exception('Supabase credentials not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY');
    }

    await Supabase.initialize(
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
      debug: kDebugMode,
    );

    client = Supabase.instance.client;
    isInitialized.value = true;

    // Initial data load
    await _loadInitialData();
  }

  Future<void> _loadInitialData() async {
    try {
      // Load members and tags on startup
      await Future.wait([
        loadMembers(),
        loadTags(),
      ]);
    } catch (e, s) {
      Logger.error("Failed to load initial CRM data", error: e, trace: s);
    }
  }

  // ===== MEMBER OPERATIONS =====

  /// Load all members from Supabase
  Future<List<Member>> loadMembers() async {
    try {
      final response = await client
          .from('members')
          .select()
          .order('name', ascending: true);

      members.value = (response as List)
          .map((json) => Member.fromJson(json))
          .toList();

      Logger.debug("Loaded ${members.length} members from Supabase");
      return members;
    } catch (e, s) {
      Logger.error("Failed to load members", error: e, trace: s);
      lastError.value = e.toString();
      return [];
    }
  }

  /// Get member by phone number (E.164 format)
  /// This is the KEY link between BlueBubbles chats and CRM members
  Future<Member?> getMemberByPhone(String phoneNumber) async {
    try {
      // Normalize phone number to E.164 format
      String normalized = _normalizePhoneNumber(phoneNumber);

      final response = await client
          .from('members')
          .select()
          .eq('phone_e164', normalized)
          .maybeSingle();

      if (response == null) {
        Logger.debug("No member found for phone: $normalized");
        return null;
      }

      return Member.fromJson(response);
    } catch (e, s) {
      Logger.error("Failed to get member by phone", error: e, trace: s);
      return null;
    }
  }

  /// Get member by ID
  Future<Member?> getMemberById(String memberId) async {
    try {
      final response = await client
          .from('members')
          .select()
          .eq('id', memberId)
          .single();

      return Member.fromJson(response);
    } catch (e, s) {
      Logger.error("Failed to get member by ID", error: e, trace: s);
      return null;
    }
  }

  /// Create new member
  Future<Member?> createMember(Map<String, dynamic> memberData) async {
    try {
      final response = await client
          .from('members')
          .insert(memberData)
          .select()
          .single();

      final newMember = Member.fromJson(response);
      members.add(newMember);

      Logger.info("Created new member: ${newMember.name}");
      return newMember;
    } catch (e, s) {
      Logger.error("Failed to create member", error: e, trace: s);
      lastError.value = e.toString();
      return null;
    }
  }

  /// Update member
  Future<Member?> updateMember(String memberId, Map<String, dynamic> updates) async {
    try {
      final response = await client
          .from('members')
          .update(updates)
          .eq('id', memberId)
          .select()
          .single();

      final updatedMember = Member.fromJson(response);

      // Update local cache
      final index = members.indexWhere((m) => m.id == memberId);
      if (index != -1) {
        members[index] = updatedMember;
      }

      Logger.info("Updated member: ${updatedMember.name}");
      return updatedMember;
    } catch (e, s) {
      Logger.error("Failed to update member", error: e, trace: s);
      lastError.value = e.toString();
      return null;
    }
  }

  /// Search members by name or phone
  Future<List<Member>> searchMembers(String query) async {
    try {
      final response = await client
          .from('members')
          .select()
          .or('name.ilike.%$query%,phone.ilike.%$query%,email.ilike.%$query%')
          .order('name', ascending: true);

      return (response as List)
          .map((json) => Member.fromJson(json))
          .toList();
    } catch (e, s) {
      Logger.error("Failed to search members", error: e, trace: s);
      return [];
    }
  }

  /// Filter members by tags
  Future<List<Member>> getMembersByTags(List<String> tagIds) async {
    try {
      final response = await client
          .from('members')
          .select()
          .overlaps('tags', tagIds)
          .order('name', ascending: true);

      return (response as List)
          .map((json) => Member.fromJson(json))
          .toList();
    } catch (e, s) {
      Logger.error("Failed to get members by tags", error: e, trace: s);
      return [];
    }
  }

  // ===== TAG OPERATIONS =====

  /// Load all tags
  Future<List<Tag>> loadTags() async {
    try {
      final response = await client
          .from('tags')
          .select()
          .order('name', ascending: true);

      tags.value = (response as List)
          .map((json) => Tag.fromJson(json))
          .toList();

      Logger.debug("Loaded ${tags.length} tags from Supabase");
      return tags;
    } catch (e, s) {
      Logger.error("Failed to load tags", error: e, trace: s);
      return [];
    }
  }

  /// Create new tag
  Future<Tag?> createTag(String name, String color, {String? description}) async {
    try {
      final response = await client
          .from('tags')
          .insert({
            'name': name,
            'color': color,
            'description': description,
          })
          .select()
          .single();

      final newTag = Tag.fromJson(response);
      tags.add(newTag);

      Logger.info("Created new tag: $name");
      return newTag;
    } catch (e, s) {
      Logger.error("Failed to create tag", error: e, trace: s);
      lastError.value = e.toString();
      return null;
    }
  }

  /// Add tag to member
  Future<bool> addTagToMember(String memberId, String tagId) async {
    try {
      await client.from('member_tags').insert({
        'member_id': memberId,
        'tag_id': tagId,
        'added_at': DateTime.now().toIso8601String(),
      });

      Logger.info("Added tag to member");
      return true;
    } catch (e, s) {
      Logger.error("Failed to add tag to member", error: e, trace: s);
      return false;
    }
  }

  /// Remove tag from member
  Future<bool> removeTagFromMember(String memberId, String tagId) async {
    try {
      await client
          .from('member_tags')
          .delete()
          .eq('member_id', memberId)
          .eq('tag_id', tagId);

      Logger.info("Removed tag from member");
      return true;
    } catch (e, s) {
      Logger.error("Failed to remove tag from member", error: e, trace: s);
      return false;
    }
  }

  /// Get tags for a member
  Future<List<Tag>> getTagsForMember(String memberId) async {
    try {
      final response = await client
          .from('member_tags')
          .select('tag_id, tags(*)')
          .eq('member_id', memberId);

      return (response as List)
          .map((item) => Tag.fromJson(item['tags']))
          .toList();
    } catch (e, s) {
      Logger.error("Failed to get tags for member", error: e, trace: s);
      return [];
    }
  }

  // ===== ANALYTICS =====

  /// Get member statistics
  Future<MemberStats?> getMemberStats() async {
    try {
      // This would call a Supabase function or aggregate query
      final response = await client.rpc('get_member_stats');
      return MemberStats.fromJson(response);
    } catch (e, s) {
      Logger.error("Failed to get member stats", error: e, trace: s);
      return null;
    }
  }

  /// Track intro message sent
  Future<bool> logIntroSent(String memberId, String status) async {
    try {
      await client.from('intro_sends').insert({
        'member_id': memberId,
        'status': status,
        'sent_at': DateTime.now().toIso8601String(),
      });

      return true;
    } catch (e, s) {
      Logger.error("Failed to log intro sent", error: e, trace: s);
      return false;
    }
  }

  /// Track opt-out/opt-in
  Future<bool> logOptAction(String memberId, String action) async {
    try {
      await client.from('opt_out_log').insert({
        'member_id': memberId,
        'action': action,
        'timestamp': DateTime.now().toIso8601String(),
      });

      // Update member's opt-out status
      await updateMember(memberId, {
        'opted_out': action == 'opt-out',
      });

      return true;
    } catch (e, s) {
      Logger.error("Failed to log opt action", error: e, trace: s);
      return false;
    }
  }

  // ===== TEMPLATES =====

  /// Get all message templates
  Future<List<MessageTemplate>> getTemplates() async {
    try {
      final response = await client
          .from('intro_message_templates')
          .select()
          .order('created_at', ascending: false);

      return (response as List)
          .map((json) => MessageTemplate.fromJson(json))
          .toList();
    } catch (e, s) {
      Logger.error("Failed to get templates", error: e, trace: s);
      return [];
    }
  }

  /// Get default template
  Future<MessageTemplate?> getDefaultTemplate() async {
    try {
      final response = await client
          .from('intro_message_templates')
          .select()
          .eq('is_default', true)
          .maybeSingle();

      if (response == null) return null;
      return MessageTemplate.fromJson(response);
    } catch (e, s) {
      Logger.error("Failed to get default template", error: e, trace: s);
      return null;
    }
  }

  // ===== HELPER METHODS =====

  /// Normalize phone number to E.164 format
  String _normalizePhoneNumber(String phone) {
    // Remove all non-digit characters
    String cleaned = phone.replaceAll(RegExp(r'[^\d+]'), '');

    // Add +1 prefix if not present and looks like US number
    if (!cleaned.startsWith('+')) {
      if (cleaned.length == 10) {
        cleaned = '+1$cleaned';
      } else if (cleaned.length == 11 && cleaned.startsWith('1')) {
        cleaned = '+$cleaned';
      }
    }

    return cleaned;
  }
}

// ===== DATA MODELS =====

class Member {
  final String id;
  final String name;
  final String? email;
  final String? phone;
  final String? phoneE164;
  final DateTime? dateOfBirth;
  final String? preferredPronouns;
  final String? genderIdentity;
  final String? address;
  final String? county;
  final String? congressionalDistrict;
  final String? race;
  final String? sexualOrientation;
  final String? desireToLead;
  final String? hoursPerWeek;
  final String? educationLevel;
  final bool? registeredVoter;
  final String? inSchool;
  final String? schoolName;
  final String? employed;
  final String? industry;
  final bool? hispanicLatino;
  final String? accommodations;
  final String? communityType;
  final String? languages;
  final String? whyJoin;
  final DateTime? lastContacted;
  final bool optOut;
  final List<String>? committee;
  final String? notes;
  final DateTime? introSentAt;
  final String? optOutReason;
  final DateTime? optOutDate;
  final DateTime? optInDate;
  final String? disability;
  final String? politicalExperience;
  final String? currentInvolvement;
  final String? religion;
  final String? instagram;
  final String? tiktok;
  final String? x;
  final String? zodiacSign;
  final String? leadershipExperience;
  final DateTime? dateJoined;
  final String? goalsAndAmbitions;
  final String? qualifiedExperience;
  final String? referralSource;
  final String? passionateIssues;
  final String? whyIssuesMatter;
  final String? areasOfInterest;
  final DateTime? createdAt;

  Member({
    required this.id,
    required this.name,
    this.email,
    this.phone,
    this.phoneE164,
    this.dateOfBirth,
    this.preferredPronouns,
    this.genderIdentity,
    this.address,
    this.county,
    this.congressionalDistrict,
    this.race,
    this.sexualOrientation,
    this.desireToLead,
    this.hoursPerWeek,
    this.educationLevel,
    this.registeredVoter,
    this.inSchool,
    this.schoolName,
    this.employed,
    this.industry,
    this.hispanicLatino,
    this.accommodations,
    this.communityType,
    this.languages,
    this.whyJoin,
    this.lastContacted,
    this.optOut = false,
    this.committee,
    this.notes,
    this.introSentAt,
    this.optOutReason,
    this.optOutDate,
    this.optInDate,
    this.disability,
    this.politicalExperience,
    this.currentInvolvement,
    this.religion,
    this.instagram,
    this.tiktok,
    this.x,
    this.zodiacSign,
    this.leadershipExperience,
    this.dateJoined,
    this.goalsAndAmbitions,
    this.qualifiedExperience,
    this.referralSource,
    this.passionateIssues,
    this.whyIssuesMatter,
    this.areasOfInterest,
    this.createdAt,
  });

  factory Member.fromJson(Map<String, dynamic> json) {
    return Member(
      id: json['id'],
      name: json['name'] ?? '',
      email: json['email'],
      phone: json['phone'],
      phoneE164: json['phone_e164'],
      dateOfBirth: json['date_of_birth'] != null ? DateTime.parse(json['date_of_birth']) : null,
      preferredPronouns: json['preferred_pronouns'],
      genderIdentity: json['gender_identity'],
      address: json['address'],
      county: json['county'],
      congressionalDistrict: json['congressional_district'],
      race: json['race'],
      sexualOrientation: json['sexual_orientation'],
      desireToLead: json['desire_to_lead'],
      hoursPerWeek: json['hours_per_week'],
      educationLevel: json['education_level'],
      registeredVoter: json['registered_voter'],
      inSchool: json['in_school'],
      schoolName: json['school_name'],
      employed: json['employed'],
      industry: json['industry'],
      hispanicLatino: json['hispanic_latino'],
      accommodations: json['accommodations'],
      communityType: json['community_type'],
      languages: json['languages'],
      whyJoin: json['why_join'],
      lastContacted: json['last_contacted'] != null ? DateTime.parse(json['last_contacted']) : null,
      optOut: json['opt_out'] ?? false,
      committee: json['committee'] != null ? List<String>.from(json['committee']) : null,
      notes: json['notes'],
      introSentAt: json['intro_sent_at'] != null ? DateTime.parse(json['intro_sent_at']) : null,
      optOutReason: json['opt_out_reason'],
      optOutDate: json['opt_out_date'] != null ? DateTime.parse(json['opt_out_date']) : null,
      optInDate: json['opt_in_date'] != null ? DateTime.parse(json['opt_in_date']) : null,
      disability: json['disability'],
      politicalExperience: json['political_experience'],
      currentInvolvement: json['current_involvement'],
      religion: json['religion'],
      instagram: json['instagram'],
      tiktok: json['tiktok'],
      x: json['x'],
      zodiacSign: json['zodiac_sign'],
      leadershipExperience: json['leadership_experience'],
      dateJoined: json['date_joined'] != null ? DateTime.parse(json['date_joined']) : null,
      goalsAndAmbitions: json['goals_and_ambitions'],
      qualifiedExperience: json['qualified_experience'],
      referralSource: json['referral_source'],
      passionateIssues: json['passionate_issues'],
      whyIssuesMatter: json['why_issues_matter'],
      areasOfInterest: json['areas_of_interest'],
      createdAt: json['created_at'] != null ? DateTime.parse(json['created_at']) : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'email': email,
      'phone': phone,
      'phone_e164': phoneE164,
      'date_of_birth': dateOfBirth?.toIso8601String(),
      'preferred_pronouns': preferredPronouns,
      'gender_identity': genderIdentity,
      'address': address,
      'county': county,
      'congressional_district': congressionalDistrict,
      'race': race,
      'sexual_orientation': sexualOrientation,
      'desire_to_lead': desireToLead,
      'hours_per_week': hoursPerWeek,
      'education_level': educationLevel,
      'registered_voter': registeredVoter,
      'in_school': inSchool,
      'school_name': schoolName,
      'employed': employed,
      'industry': industry,
      'hispanic_latino': hispanicLatino,
      'accommodations': accommodations,
      'community_type': communityType,
      'languages': languages,
      'why_join': whyJoin,
      'last_contacted': lastContacted?.toIso8601String(),
      'opt_out': optOut,
      'committee': committee,
      'notes': notes,
      'intro_sent_at': introSentAt?.toIso8601String(),
      'opt_out_reason': optOutReason,
      'opt_out_date': optOutDate?.toIso8601String(),
      'opt_in_date': optInDate?.toIso8601String(),
      'disability': disability,
      'political_experience': politicalExperience,
      'current_involvement': currentInvolvement,
      'religion': religion,
      'instagram': instagram,
      'tiktok': tiktok,
      'x': x,
      'zodiac_sign': zodiacSign,
      'leadership_experience': leadershipExperience,
      'date_joined': dateJoined?.toIso8601String(),
      'goals_and_ambitions': goalsAndAmbitions,
      'qualified_experience': qualifiedExperience,
      'referral_source': referralSource,
      'passionate_issues': passionateIssues,
      'why_issues_matter': whyIssuesMatter,
      'areas_of_interest': areasOfInterest,
      'created_at': createdAt?.toIso8601String(),
    };
  }
}

class Tag {
  final String id;
  final String name;
  final String color;
  final String? description;

  Tag({
    required this.id,
    required this.name,
    required this.color,
    this.description,
  });

  factory Tag.fromJson(Map<String, dynamic> json) {
    return Tag(
      id: json['id'],
      name: json['name'],
      color: json['color'],
      description: json['description'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'color': color,
      'description': description,
    };
  }
}

class MessageTemplate {
  final String id;
  final String name;
  final String body;
  final bool isDefault;
  final DateTime createdAt;

  MessageTemplate({
    required this.id,
    required this.name,
    required this.body,
    required this.isDefault,
    required this.createdAt,
  });

  factory MessageTemplate.fromJson(Map<String, dynamic> json) {
    return MessageTemplate(
      id: json['id'],
      name: json['name'],
      body: json['body'],
      isDefault: json['is_default'] ?? false,
      createdAt: DateTime.parse(json['created_at']),
    );
  }
}

class MemberStats {
  final int totalMembers;
  final int activeMembers;
  final int optedOut;
  final Map<String, int> byCounty;
  final Map<String, int> byDistrict;

  MemberStats({
    required this.totalMembers,
    required this.activeMembers,
    required this.optedOut,
    required this.byCounty,
    required this.byDistrict,
  });

  factory MemberStats.fromJson(Map<String, dynamic> json) {
    return MemberStats(
      totalMembers: json['total_members'] ?? 0,
      activeMembers: json['active_members'] ?? 0,
      optedOut: json['opted_out'] ?? 0,
      byCounty: Map<String, int>.from(json['by_county'] ?? {}),
      byDistrict: Map<String, int>.from(json['by_district'] ?? {}),
    );
  }
}
