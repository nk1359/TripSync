-- MySQL dump 10.13  Distrib 8.0.36, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: tripsync
-- ------------------------------------------------------
-- Server version	8.0.36

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `chat_member_requests`
--

DROP TABLE IF EXISTS `chat_member_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chat_member_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `chat_id` int NOT NULL,
  `requester_id` int NOT NULL,
  `friend_id` int NOT NULL,
  `status` enum('pending','approved','rejected') DEFAULT 'pending',
  `approved_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `requester_id` (`requester_id`),
  KEY `approved_by` (`approved_by`),
  KEY `idx_chat_status` (`chat_id`,`status`),
  KEY `idx_friend_status` (`friend_id`,`status`),
  CONSTRAINT `chat_member_requests_ibfk_1` FOREIGN KEY (`chat_id`) REFERENCES `group_chats` (`chat_id`) ON DELETE CASCADE,
  CONSTRAINT `chat_member_requests_ibfk_2` FOREIGN KEY (`requester_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `chat_member_requests_ibfk_3` FOREIGN KEY (`friend_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `chat_member_requests_ibfk_4` FOREIGN KEY (`approved_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `chat_member_requests`
--

LOCK TABLES `chat_member_requests` WRITE;
/*!40000 ALTER TABLE `chat_member_requests` DISABLE KEYS */;
/*!40000 ALTER TABLE `chat_member_requests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `chat_messages`
--

DROP TABLE IF EXISTS `chat_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chat_messages` (
  `message_id` int NOT NULL AUTO_INCREMENT,
  `chat_id` int NOT NULL,
  `user_id` int NOT NULL,
  `message` text NOT NULL,
  `sent_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`),
  KEY `chat_id` (`chat_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `chat_messages_ibfk_1` FOREIGN KEY (`chat_id`) REFERENCES `group_chats` (`chat_id`) ON DELETE CASCADE,
  CONSTRAINT `chat_messages_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `chat_messages`
--

LOCK TABLES `chat_messages` WRITE;
/*!40000 ALTER TABLE `chat_messages` DISABLE KEYS */;
INSERT INTO `chat_messages` VALUES (1,2,1,'hi','2025-10-10 00:55:23'),(2,2,1,'hi','2025-10-10 01:12:29'),(3,2,1,'jo','2025-10-10 01:32:22'),(4,2,1,'hahah','2025-10-10 01:48:24'),(5,2,7,'why u laughing','2025-10-10 02:08:24'),(6,2,1,'cuz i wanna','2025-10-10 02:12:35'),(7,2,7,'okkk','2025-10-10 02:14:59');
/*!40000 ALTER TABLE `chat_messages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `chat_participants`
--

DROP TABLE IF EXISTS `chat_participants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chat_participants` (
  `participant_id` int NOT NULL AUTO_INCREMENT,
  `chat_id` int NOT NULL,
  `user_id` int NOT NULL,
  `joined_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`participant_id`),
  UNIQUE KEY `unique_chat_user` (`chat_id`,`user_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `chat_participants_ibfk_1` FOREIGN KEY (`chat_id`) REFERENCES `group_chats` (`chat_id`) ON DELETE CASCADE,
  CONSTRAINT `chat_participants_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `chat_participants`
--

LOCK TABLES `chat_participants` WRITE;
/*!40000 ALTER TABLE `chat_participants` DISABLE KEYS */;
INSERT INTO `chat_participants` VALUES (2,2,7,'2025-10-07 20:41:48'),(20,2,1,'2025-10-10 20:04:11'),(22,2,8,'2025-10-10 20:13:26'),(23,25,1,'2025-10-10 20:14:13'),(24,25,7,'2025-10-10 20:14:34');
/*!40000 ALTER TABLE `chat_participants` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `direct_chats`
--

DROP TABLE IF EXISTS `direct_chats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `direct_chats` (
  `chat_id` int NOT NULL AUTO_INCREMENT,
  `user1_id` int NOT NULL,
  `user2_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `archived_by_user1` tinyint(1) DEFAULT '0',
  `archived_by_user2` tinyint(1) DEFAULT '0',
  `last_message_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`chat_id`),
  KEY `user1_id` (`user1_id`),
  KEY `user2_id` (`user2_id`),
  CONSTRAINT `direct_chats_ibfk_1` FOREIGN KEY (`user1_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `direct_chats_ibfk_2` FOREIGN KEY (`user2_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `direct_chats`
--

LOCK TABLES `direct_chats` WRITE;
/*!40000 ALTER TABLE `direct_chats` DISABLE KEYS */;
INSERT INTO `direct_chats` VALUES (1,1,7,'2025-10-10 00:51:55',0,0,'2025-10-10 01:40:45'),(2,1,8,'2025-10-10 00:54:27',0,0,NULL);
/*!40000 ALTER TABLE `direct_chats` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `direct_messages`
--

DROP TABLE IF EXISTS `direct_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `direct_messages` (
  `message_id` int NOT NULL AUTO_INCREMENT,
  `chat_id` int NOT NULL,
  `sender_id` int NOT NULL,
  `message_content` text NOT NULL,
  `sent_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`),
  KEY `chat_id` (`chat_id`),
  KEY `sender_id` (`sender_id`),
  CONSTRAINT `direct_messages_ibfk_1` FOREIGN KEY (`chat_id`) REFERENCES `direct_chats` (`chat_id`) ON DELETE CASCADE,
  CONSTRAINT `direct_messages_ibfk_2` FOREIGN KEY (`sender_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `direct_messages`
--

LOCK TABLES `direct_messages` WRITE;
/*!40000 ALTER TABLE `direct_messages` DISABLE KEYS */;
INSERT INTO `direct_messages` VALUES (1,1,7,'hi','2025-10-10 00:52:00'),(2,1,7,'how are you doing man','2025-10-10 00:52:09'),(3,1,1,'hi','2025-10-10 01:38:20'),(4,1,7,'hehe','2025-10-10 01:40:45');
/*!40000 ALTER TABLE `direct_messages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `friends`
--

DROP TABLE IF EXISTS `friends`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `friends` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `friend_id` int NOT NULL,
  `status` enum('pending','accepted','rejected') DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_friendship` (`user_id`,`friend_id`),
  KEY `fk_friend` (`friend_id`),
  CONSTRAINT `fk_friend` FOREIGN KEY (`friend_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `friends`
--

LOCK TABLES `friends` WRITE;
/*!40000 ALTER TABLE `friends` DISABLE KEYS */;
INSERT INTO `friends` VALUES (11,1,7,'accepted','2025-04-21 20:24:18','2025-04-21 20:24:31'),(12,8,1,'accepted','2025-04-21 20:27:13','2025-04-21 20:27:23'),(13,7,8,'accepted','2025-10-09 22:38:22','2025-10-10 20:11:01'),(15,1,9,'pending','2025-10-10 18:29:47','2025-10-10 18:29:47');
/*!40000 ALTER TABLE `friends` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `google_places`
--

DROP TABLE IF EXISTS `google_places`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `google_places` (
  `place_id` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `address` text,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `place_type` varchar(100) DEFAULT NULL,
  `rating` decimal(3,2) DEFAULT NULL,
  `price_level` int DEFAULT NULL,
  `phone_number` varchar(50) DEFAULT NULL,
  `website` varchar(500) DEFAULT NULL,
  `photo_reference` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`place_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `google_places`
--

LOCK TABLES `google_places` WRITE;
/*!40000 ALTER TABLE `google_places` DISABLE KEYS */;
INSERT INTO `google_places` VALUES ('ChIJj6UVQhvy2YkRHR-B-vvKBUQ','Super 8 by Wyndham Liverpool/Syracuse North Airport','421 7th N St, Liverpool, NY 13088, USA',43.09162540,-76.17127340,'establishment, lodging, point_of_interest',3.90,NULL,NULL,NULL,NULL,'2025-10-09 20:41:55'),('ChIJL_hpKLI1K4gRFpjT_YY3Vw8','Himalayan Kitchen (Momo2Go)','1526 Queen St W, Toronto, ON M6R 1A4, Canada',43.64027280,-79.43890750,'establishment, food, point_of_interest, restaurant',4.70,NULL,NULL,NULL,NULL,'2025-10-09 20:41:54');
/*!40000 ALTER TABLE `google_places` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `group_chats`
--

DROP TABLE IF EXISTS `group_chats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `group_chats` (
  `chat_id` int NOT NULL AUTO_INCREMENT,
  `trip_id` int DEFAULT NULL,
  `chat_name` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`chat_id`),
  KEY `group_chats_ibfk_1` (`trip_id`),
  CONSTRAINT `group_chats_ibfk_1` FOREIGN KEY (`trip_id`) REFERENCES `trips` (`trip_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `group_chats`
--

LOCK TABLES `group_chats` WRITE;
/*!40000 ALTER TABLE `group_chats` DISABLE KEYS */;
INSERT INTO `group_chats` VALUES (2,2,'toronto Chat','2025-10-07 20:41:48'),(25,11,'nayayaya Chat','2025-10-10 20:14:13');
/*!40000 ALTER TABLE `group_chats` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `planner`
--

DROP TABLE IF EXISTS `planner`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `planner` (
  `planner_id` int NOT NULL AUTO_INCREMENT,
  `trip_id` int NOT NULL,
  `item_name` varchar(255) NOT NULL,
  `item_type` varchar(50) DEFAULT 'custom',
  `description` text,
  `location` varchar(255) DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `cost` decimal(10,2) DEFAULT NULL,
  `notes` text,
  `google_place_id` varchar(255) DEFAULT NULL,
  `order_index` int DEFAULT '0',
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `distance_from_previous` varchar(50) DEFAULT NULL,
  `duration_from_previous` varchar(50) DEFAULT NULL,
  `from_location` varchar(255) DEFAULT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  PRIMARY KEY (`planner_id`),
  KEY `trip_id` (`trip_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `planner_ibfk_1` FOREIGN KEY (`trip_id`) REFERENCES `trips` (`trip_id`) ON DELETE CASCADE,
  CONSTRAINT `planner_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `planner`
--

LOCK TABLES `planner` WRITE;
/*!40000 ALTER TABLE `planner` DISABLE KEYS */;
INSERT INTO `planner` VALUES (1,2,'Himalayan Kitchen (Momo2Go)','Restaurants','','1526 Queen St W, Toronto, ON M6R 1A4, Canada','2025-10-31','2025-10-31',NULL,NULL,NULL,'cool','ChIJL_hpKLI1K4gRFpjT_YY3Vw8',2,7,'2025-10-07 21:54:33','2025-10-10 23:27:16','238 mi','3 hours 49 mins','Super 8 by Wyndham Liverpool/Syracuse North Airport',43.64027280,-79.43890750),(2,2,'Super 8 by Wyndham Liverpool/Syracuse North Airport','Hotels','','421 7th N St, Liverpool, NY 13088, USA','2025-10-31','2025-10-31','12:00:00',NULL,NULL,'','ChIJj6UVQhvy2YkRHR-B-vvKBUQ',1,7,'2025-10-07 21:58:30','2025-10-10 23:27:16','1.6 mi','6 mins','127 Brace St',43.09162540,-76.17127340),(4,2,'127 Brace St','Attractions','','127 Brace St, Syracuse, NY 13208, USA','2025-10-31','2025-10-31',NULL,NULL,NULL,'my house','ChIJNfSVSEfy2YkRKDf08_lbpUg',0,7,'2025-10-08 00:01:20','2025-10-10 23:27:16','1.6 mi','6 mins','Super 8 by Wyndham Liverpool/Syracuse North Airport',43.07571770,-76.15402650),(5,2,'CN Tower','Attractions','','290 Bremner Blvd, Toronto, ON M5V 3L9, Canada','2025-11-01','2025-11-01',NULL,NULL,NULL,'','ChIJmzrzi9Y0K4gRgXUc3sTY7RU',3,7,'2025-10-09 18:11:57','2025-10-12 02:44:38','3.5 mi','15 mins','Himalayan Kitchen (Momo2Go)',43.64256620,-79.38705680);
/*!40000 ALTER TABLE `planner` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `planner_places`
--

DROP TABLE IF EXISTS `planner_places`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `planner_places` (
  `planner_place_id` int NOT NULL AUTO_INCREMENT,
  `planner_id` int NOT NULL,
  `google_place_id` varchar(255) NOT NULL,
  PRIMARY KEY (`planner_place_id`),
  UNIQUE KEY `unique_planner_place` (`planner_id`,`google_place_id`),
  KEY `google_place_id` (`google_place_id`),
  CONSTRAINT `planner_places_ibfk_1` FOREIGN KEY (`planner_id`) REFERENCES `planner` (`planner_id`) ON DELETE CASCADE,
  CONSTRAINT `planner_places_ibfk_2` FOREIGN KEY (`google_place_id`) REFERENCES `google_places` (`place_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `planner_places`
--

LOCK TABLES `planner_places` WRITE;
/*!40000 ALTER TABLE `planner_places` DISABLE KEYS */;
/*!40000 ALTER TABLE `planner_places` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `trip_member_requests`
--

DROP TABLE IF EXISTS `trip_member_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `trip_member_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `trip_id` int NOT NULL,
  `requester_id` int NOT NULL,
  `friend_id` int NOT NULL,
  `status` enum('pending','approved','rejected') DEFAULT 'pending',
  `owner_approved` tinyint(1) DEFAULT '0',
  `friend_accepted` tinyint(1) DEFAULT '0',
  `approved_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `requester_id` (`requester_id`),
  KEY `approved_by` (`approved_by`),
  KEY `idx_trip_status` (`trip_id`,`status`),
  KEY `idx_friend_status` (`friend_id`,`status`),
  CONSTRAINT `trip_member_requests_ibfk_1` FOREIGN KEY (`trip_id`) REFERENCES `trips` (`trip_id`) ON DELETE CASCADE,
  CONSTRAINT `trip_member_requests_ibfk_2` FOREIGN KEY (`requester_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `trip_member_requests_ibfk_3` FOREIGN KEY (`friend_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `trip_member_requests_ibfk_4` FOREIGN KEY (`approved_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `trip_member_requests`
--

LOCK TABLES `trip_member_requests` WRITE;
/*!40000 ALTER TABLE `trip_member_requests` DISABLE KEYS */;
INSERT INTO `trip_member_requests` VALUES (9,2,7,1,'approved',1,1,1,'2025-10-10 20:03:08','2025-10-10 20:04:11'),(10,2,1,8,'approved',1,1,8,'2025-10-10 20:04:26','2025-10-10 20:11:00'),(11,2,1,8,'approved',1,1,8,'2025-10-10 20:12:25','2025-10-10 20:13:26'),(12,11,1,7,'approved',1,1,7,'2025-10-10 20:14:14','2025-10-10 20:14:34'),(13,11,7,8,'approved',1,1,1,'2025-10-10 20:14:44','2025-10-10 20:15:15'),(14,11,1,8,'pending',1,0,NULL,'2025-10-10 23:18:37','2025-10-10 23:18:37');
/*!40000 ALTER TABLE `trip_member_requests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `trip_notifications`
--

DROP TABLE IF EXISTS `trip_notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `trip_notifications` (
  `notification_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `trip_id` int NOT NULL,
  `added_by_user_id` int NOT NULL,
  `notification_type` varchar(50) DEFAULT 'trip_added',
  `is_read` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notification_id`),
  KEY `user_id` (`user_id`),
  KEY `trip_id` (`trip_id`),
  KEY `added_by_user_id` (`added_by_user_id`),
  CONSTRAINT `trip_notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `trip_notifications_ibfk_2` FOREIGN KEY (`trip_id`) REFERENCES `trips` (`trip_id`) ON DELETE CASCADE,
  CONSTRAINT `trip_notifications_ibfk_3` FOREIGN KEY (`added_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `trip_notifications`
--

LOCK TABLES `trip_notifications` WRITE;
/*!40000 ALTER TABLE `trip_notifications` DISABLE KEYS */;
/*!40000 ALTER TABLE `trip_notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `trip_participants`
--

DROP TABLE IF EXISTS `trip_participants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `trip_participants` (
  `participant_id` int NOT NULL AUTO_INCREMENT,
  `trip_id` int NOT NULL,
  `user_id` int NOT NULL,
  `joined_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `role` enum('owner','member') DEFAULT 'member',
  PRIMARY KEY (`participant_id`),
  UNIQUE KEY `unique_trip_user` (`trip_id`,`user_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `trip_participants_ibfk_1` FOREIGN KEY (`trip_id`) REFERENCES `trips` (`trip_id`) ON DELETE CASCADE,
  CONSTRAINT `trip_participants_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `trip_participants`
--

LOCK TABLES `trip_participants` WRITE;
/*!40000 ALTER TABLE `trip_participants` DISABLE KEYS */;
INSERT INTO `trip_participants` VALUES (2,2,7,'2025-10-07 20:41:48','owner'),(20,2,1,'2025-10-10 20:04:11','member'),(22,2,8,'2025-10-10 20:13:26','member'),(23,11,1,'2025-10-10 20:14:13','owner'),(24,11,7,'2025-10-10 20:14:34','member');
/*!40000 ALTER TABLE `trip_participants` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `trips`
--

DROP TABLE IF EXISTS `trips`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `trips` (
  `trip_id` int NOT NULL AUTO_INCREMENT,
  `trip_name` varchar(255) NOT NULL,
  `description` text,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`trip_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `trips_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `trips`
--

LOCK TABLES `trips` WRITE;
/*!40000 ALTER TABLE `trips` DISABLE KEYS */;
INSERT INTO `trips` VALUES (2,'toronto','','2025-10-31','2025-11-02',7,'2025-10-07 20:41:48','2025-10-07 20:41:48'),(11,'nayayaya','','2026-05-14','2026-05-16',1,'2025-10-10 20:14:13','2025-10-10 20:14:13');
/*!40000 ALTER TABLE `trips` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `unread_messages`
--

DROP TABLE IF EXISTS `unread_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `unread_messages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `chat_id` int NOT NULL,
  `chat_type` enum('group','direct') DEFAULT 'group',
  `unread_count` int DEFAULT '0',
  `last_message_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_chat` (`user_id`,`chat_id`,`chat_type`),
  CONSTRAINT `unread_messages_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `unread_messages`
--

LOCK TABLES `unread_messages` WRITE;
/*!40000 ALTER TABLE `unread_messages` DISABLE KEYS */;
/*!40000 ALTER TABLE `unread_messages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `user_id` int NOT NULL AUTO_INCREMENT,
  `first_name` varchar(50) NOT NULL,
  `last_name` varchar(50) NOT NULL,
  `username` varchar(50) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'Nishant','Kharel','Nishant10M','nishantbro@gmail.com','Nishant1',NULL),(7,'Umesh','Dahal','udahal12','udahal12@gmail.com','Nishant1',NULL),(8,'Powan','Poudel','ppoudel123','ppoudel123@gmail.com','Nish@_-.41212',NULL),(9,'Chris','Johnson','cjrocks32','cjrocks32@yahoo.com','Nishant1',NULL);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping events for database 'tripsync'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-10-12 18:13:05
