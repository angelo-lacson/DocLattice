"""
Constants for the moderation system.
"""

# Threshold for flagging high moderation activity (actions per hour per action type)
# When any action type exceeds this rate, isAboveThreshold is set to True
MODERATION_HOURLY_RATE_THRESHOLD = 10
