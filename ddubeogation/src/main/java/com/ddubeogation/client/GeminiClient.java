package com.ddubeogation.client;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Map;

/**
 * Google Gemini API 클라이언트
 *
 * POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}
 */
@Slf4j
@Component
public class GeminiClient {

    private static final String BASE_URL = "https://generativelanguage.googleapis.com";

    private final WebClient webClient;
    private final String    model;
    private final int       maxTokens;
    private final String    apiKey;

    public GeminiClient(
            @Value("${ddubeogation.gemini.api-key}")   String apiKey,
            @Value("${ddubeogation.gemini.model}")     String model,
            @Value("${ddubeogation.gemini.max-tokens}") int maxTokens) {
        this.apiKey    = apiKey;
        this.model     = model;
        this.maxTokens = maxTokens;
        this.webClient = WebClient.builder()
            .baseUrl(BASE_URL)
            .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
            .build();
    }

    public Mono<String> complete(String systemPrompt, String userPrompt) {
        Map<String, Object> body = Map.of(
            "system_instruction", Map.of(
                "parts", List.of(Map.of("text", systemPrompt))
            ),
            "contents", List.of(
                Map.of("role", "user", "parts", List.of(Map.of("text", userPrompt)))
            ),
            "generationConfig", Map.of(
                "maxOutputTokens", maxTokens
            )
        );

        return webClient.post()
            .uri("/v1beta/models/{model}:generateContent?key={key}", model, apiKey)
            .bodyValue(body)
            .retrieve()
            .bodyToMono(Map.class)
            .map(this::extractText)
            .doOnSuccess(text -> log.debug("[Gemini] response: {}", text))
            .doOnError(e -> log.error("[Gemini] API error: {}", e.getMessage()));
    }

    @SuppressWarnings("unchecked")
    private String extractText(Map<?, ?> response) {
        try {
            List<?> candidates = (List<?>) response.get("candidates");
            Map<?, ?> first    = (Map<?, ?>) candidates.get(0);
            Map<?, ?> content  = (Map<?, ?>) first.get("content");
            List<?> parts      = (List<?>) content.get("parts");
            Map<?, ?> part     = (Map<?, ?>) parts.get(0);
            return (String) part.get("text");
        } catch (Exception e) {
            log.warn("[Gemini] Failed to parse response: {}", response);
            return "";
        }
    }
}
