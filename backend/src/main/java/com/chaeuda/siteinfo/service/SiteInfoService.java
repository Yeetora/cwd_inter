package com.chaeuda.siteinfo.service;

import com.chaeuda.common.exception.ApiException;
import com.chaeuda.file.ImageStorage;
import com.chaeuda.file.ImageValidator;
import com.chaeuda.file.StoredFile;
import com.chaeuda.siteinfo.domain.SiteInfo;
import com.chaeuda.siteinfo.dto.SiteInfoResponse;
import com.chaeuda.siteinfo.dto.SiteInfoUpdateRequest;
import com.chaeuda.siteinfo.repository.SiteInfoRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SiteInfoService {

    private static final String HERO_PREFIX = "site-info";

    private final SiteInfoRepository siteInfoRepository;
    private final ImageStorage imageStorage;

    public SiteInfoResponse get() {
        return toResponse(getOrInit());
    }

    @Transactional
    public SiteInfoResponse update(SiteInfoUpdateRequest req) {
        SiteInfo siteInfo = getOrInit();
        siteInfo.updateContact(
                emptyToNull(req.companyPhone()),
                emptyToNull(req.companyEmail()),
                emptyToNull(req.companyAddress()),
                emptyToNull(req.businessHours())
        );
        siteInfoRepository.save(siteInfo);
        return toResponse(siteInfo);
    }

    @Transactional
    public SiteInfoResponse uploadHero(MultipartFile file) throws IOException {
        ImageValidator.validate(file);
        SiteInfo siteInfo = getOrInit();

        String oldPath = siteInfo.getHeroImagePath();

        StoredFile stored;
        try (InputStream in = file.getInputStream()) {
            stored = imageStorage.store(in, file.getOriginalFilename(), HERO_PREFIX);
        }
        siteInfo.updateHeroImagePath(stored.filePath());
        siteInfoRepository.save(siteInfo);

        // 새 이미지 저장 성공 후 이전 이미지 정리 (best effort)
        if (oldPath != null && !oldPath.isBlank()) {
            try {
                imageStorage.delete(oldPath);
            } catch (Exception e) {
                log.warn("Failed to delete previous hero image '{}': {}", oldPath, e.getMessage());
            }
        }
        return toResponse(siteInfo);
    }

    @Transactional
    public SiteInfoResponse deleteHero() {
        SiteInfo siteInfo = getOrInit();
        if (siteInfo.getHeroImagePath() == null) {
            throw ApiException.badRequest("히어로 이미지가 설정되어 있지 않습니다");
        }
        String path = siteInfo.getHeroImagePath();
        siteInfo.updateHeroImagePath(null);
        siteInfoRepository.save(siteInfo);
        try {
            imageStorage.delete(path);
        } catch (Exception e) {
            log.warn("Failed to delete hero image '{}': {}", path, e.getMessage());
        }
        return toResponse(siteInfo);
    }

    private SiteInfo getOrInit() {
        return siteInfoRepository.findById(SiteInfo.SINGLETON_ID)
                .orElseGet(() -> siteInfoRepository.save(SiteInfo.emptySingleton()));
    }

    private SiteInfoResponse toResponse(SiteInfo s) {
        String heroUrl = s.getHeroImagePath() == null ? null : imageStorage.publicUrl(s.getHeroImagePath());
        return new SiteInfoResponse(
                s.getCompanyPhone(),
                s.getCompanyEmail(),
                s.getCompanyAddress(),
                s.getBusinessHours(),
                heroUrl
        );
    }

    private static String emptyToNull(String s) {
        if (s == null) return null;
        String trimmed = s.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
