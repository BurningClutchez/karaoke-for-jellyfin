@multi-user
Feature: Admin Playback Sync
  As the karaoke admin
  I want to see real-time playback status on the admin page
  So that I can monitor and control the karaoke session

  Scenario: Admin sees playing status when a song is queued
    Given "Alice" has joined the karaoke session
    And the TV display is connected
    And the admin page is open
    When Alice adds a song to the queue
    Then the admin page should show "Playing" status
    And the admin page should show the seek control

  Scenario: Admin sees progress updates from the TV
    Given "Alice" has joined the karaoke session
    And the TV display is connected
    And the admin page is open
    When Alice adds a song to the queue
    Then the admin page seek slider should update over time

  Scenario: Admin moves a waiting song up the queue
    Given "Alice" has joined the karaoke session
    And the TV display is connected
    And the admin page is open
    When Alice adds songs by 3 different artists
    And the admin moves the last waiting song up
    Then the last two waiting songs should have swapped places

  Scenario: Host drags a waiting song to the top on the TV
    Given "Alice" has joined the karaoke session
    And the TV display is connected
    When Alice adds songs by 3 different artists
    And the host drags the last waiting song to the top on the TV
    Then the last waiting song should now be first
