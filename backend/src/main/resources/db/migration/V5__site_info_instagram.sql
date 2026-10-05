-- 헤더 Instagram 링크를 관리자 사이트 설정에서 변경할 수 있도록 컬럼 추가
-- 비어 있으면 헤더에서 Instagram 메뉴를 숨김

ALTER TABLE site_info
    ADD COLUMN instagram_url VARCHAR(500) DEFAULT NULL;

-- 기존에 코드에 고정돼 있던 채우다 계정을 초기값으로 유지
UPDATE site_info SET instagram_url = 'https://instagram.com/studio_chauda' WHERE id = 1;
