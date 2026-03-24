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
 * Anthropic Messages API 클라이언트 (claude-sonnet-4-6)
 *
 * Non-streaming 방식으로 호출하여 전체 응답을 받은 뒤
 * GuidanceGenerationService에서 TTS로 분기 처리한다.
 */
@Slf4j
@Component
public class AnthropicClient {

    private static final String API_URL    = "https://api.anthropic.com/v1/messages";
    private static final String API_VERSION = "2023-06-01";

    private final WebClient webClient;
    private final String    model;
    private final int       maxTokens;

    public AnthropicClient(
            @Value("${ddubeogation.anthropic.api-key}")  String apiKey,
            @Value("${ddubeogation.anthropic.model}")    String model,
            @Value("${ddubeogation.anthropic.max-tokens}") int maxTokens) {
        this.model     = model;
        this.maxTokens = maxTokens;
        this.webClient = WebClient.builder()
            .baseUrl(API_URL)
            .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
            .defaultHeader("x-api-key", apiKey)
            .defaultHeader("anthropic-version", API_VERSION)
            .build();
    }

    /**
     * system + user 프롬프트로 텍스트 완성을 요청하고 content[0].text를 반환
     */
    public Mono<String> complete(String systemPrompt, String userPrompt) {
        Map<String, Object> body = Map.of(
            "model",      model,
            "max_tokens", maxTokens,
            "system",     systemPrompt,
            "messages",   List.of(
                Map.of("role", "user", "content", userPrompt)
            )
        );

        return webClient.post()
            .bodyValue(body)
            .retrieve()
            .bodyToMono(Map.class)
            .map(this::extractText)
            .doOnSuccess(text -> log.debug("[Anthropic] response: {}", text))
            .doOnError(e  -> log.error("[Anthropic] API error: {}", e.getMessage()));
    }

    @SuppressWarnings("unchecked")
    private String extractText(Map<?, ?> response) {
        try {
            List<?> content = (List<?>) response.get("content");
            Map<?, ?> first = (Map<?, ?>) content.get(0);
            return (String) first.get("text");
        } catch (Exception e) {
            log.warn("[Anthropic] Failed to parse response: {}", response);
            return "";
        }
    }
}
