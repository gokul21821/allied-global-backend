
import { db } from '../config/firebase.js';
import admin from 'firebase-admin';

export class AuditService {
  async logAction(userId, userEmail, userName, action, specificAction, comment, metadata = {}) {
    try {
      const auditData = {
        userEmail: userEmail || 'unknown',
        userName: userName || 'unknown',
        timestamp: admin.firestore.Timestamp.now(),
        action: action, // phoneNumber, agent, conversation, etc.
        specificAction: specificAction, // phone number details, agent id, etc.
        comment: comment, // readable description like "{user name} updated agent: {agentid}"
        userId: userId || 'anonymous',
        metadata: metadata // additional data if needed
      };

      // Async logging without blocking
      await db.collection('audit_logs').add(auditData);
      console.log(`Audit logged: ${comment}`);
    } catch (error) {
      console.error('Audit logging failed:', error);
    }
  }

  // Helper method to get user details from Firebase
  async getUserDetails(userId) {
    try {
      if (!userId || userId === 'anonymous') {
        return { email: 'unknown', name: 'anonymous' };
      }

      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        return {
          email: userData.email || 'unknown',
          name: userData.name || userData.displayName || 'unknown'
        };
      }
      return { email: 'unknown', name: 'unknown' };
    } catch (error) {
      console.error('Error fetching user details:', error);
      return { email: 'unknown', name: 'unknown' };
    }
  }

  // Specific logging methods for different actions
  async logPhoneNumberAction(userId, action, phoneNumberId, comment) {
    const userDetails = await this.getUserDetails(userId);
    await this.logAction(
      userId,
      userDetails.email,
      userDetails.name,
      'phoneNumber',
      action, // Store the action type (created, updated, deleted, etc.)
      comment,
      { id: phoneNumberId }
    );
  }

  async logAgentAction(userId, action, agentId, comment) {
    const userDetails = await this.getUserDetails(userId);
    await this.logAction(
      userId,
      userDetails.email,
      userDetails.name,
      'agent',
      action, // Store the action type (created, updated, deleted, etc.)
      comment,
      { id: agentId }
    );
  }

  async logConversationAction(userId, action, conversationId, comment) {
    const userDetails = await this.getUserDetails(userId);
    await this.logAction(
      userId,
      userDetails.email,
      userDetails.name,
      'conversation',
      action, // Store the action type (created, updated, deleted, etc.)
      comment,
      { id: conversationId }
    );
  }

  async logPaymentAction(userId, action, paymentId, comment) {
    const userDetails = await this.getUserDetails(userId);
    await this.logAction(
      userId,
      userDetails.email,
      userDetails.name,
      'payment',
      action, // Store the action type (created, updated, deleted, etc.)
      comment,
      { id: paymentId }
    );
  }

  async logUserAction(userId, action, targetUserId, comment) {
    const userDetails = await this.getUserDetails(userId);
    await this.logAction(
      userId,
      userDetails.email,
      userDetails.name,
      'user',
      action, // Store the action type (created, updated, deleted, etc.)
      comment,
      { id: targetUserId }
    );
  }

  async logKnowledgeBaseAction(userId, action, kbId, comment) {
    const userDetails = await this.getUserDetails(userId);
    await this.logAction(
      userId,
      userDetails.email,
      userDetails.name,
      'knowledgeBase',
      action, // Store the action type (created, updated, deleted, etc.)
      comment,
      { id: kbId }
    );
  }

  async logToolAction(userId, action, toolId, comment) {
    const userDetails = await this.getUserDetails(userId);
    await this.logAction(
      userId,
      userDetails.email,
      userDetails.name,
      'tool',
      action, // Store the action type (created, updated, deleted, etc.)
      comment,
      { id: toolId }
    );
  }

  async logVoiceAction(userId, action, voiceId, comment) {
    const userDetails = await this.getUserDetails(userId);
    await this.logAction(
      userId,
      userDetails.email,
      userDetails.name,
      'voice',
      action, // Store the action type (created, updated, deleted, etc.)
      comment,
      { id: voiceId }
    );
  }

  async logBatchCallAction(userId, action, batchCallId, comment) {
    const userDetails = await this.getUserDetails(userId);
    await this.logAction(
      userId,
      userDetails.email,
      userDetails.name,
      'batchCall',
      action, // Store the action type (created, updated, deleted, etc.)
      comment,
      { id: batchCallId }
    );
  }
}

export const auditService = new AuditService();
