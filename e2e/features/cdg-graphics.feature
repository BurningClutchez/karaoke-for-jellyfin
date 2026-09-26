@cdg
Feature: CD+G karaoke graphics
  As a singer with a CD+G karaoke collection
  I want to pick songs that have graphics but no lyrics
  So that the TV shows their karaoke graphics

  Background:
    Given the queue is empty
    And the TV display is open
    And "Singer" has joined on a phone

  Scenario: A song with a .cdg file plays with graphics
    When the singer opens the artist "Zz CDG Artist"
    Then the song "Graphics Song" is listed with a Karaoke badge
    When the singer adds the first song
    Then the TV shows the CD+G graphics

  Scenario: A zipped song plays with graphics
    When the singer opens the artist "Zz Zip Artist"
    Then the song "Zipped Song" is listed with a Karaoke badge
    When the singer adds the first song
    Then the TV shows the CD+G graphics

  Scenario: Songs without lyrics or graphics are not offered
    When the singer opens the artist "Zz Plain Band"
    Then no songs are offered
